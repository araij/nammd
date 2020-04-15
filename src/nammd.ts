import * as jsyaml from 'js-yaml';

declare var Reveal: any;

interface Request {
  url: string;
  token?: string;
}

interface GitHubLocation {
  owner: string,
  repository: string,
  commit: string,
  path: string,
}

class NoGitHubTokenError extends Error {
  constructor() {
    super();
    Object.setPrototypeOf(this, NoGitHubTokenError.prototype);
  }
}

const revealCdn = "//cdnjs.cloudflare.com/ajax/libs/reveal.js/3.8.0/";

const defaultOptions = {
  theme: "white",
  separator: "^\r?\n---\r?\n$",
  verticalSeparator: "^\r?\n--\r?\n$",
};

// FIXME: sophisticate the regex to allow line breaks in the url function and
// multiple attributes in a single line
const cssUrl = /url\(['"](.*)['"]\)/g;

function isAbsoluteUrl(url: string): boolean {
  return /^(https?:)?\/\//.test(url);
}

function toAbsoluteUrl(url: string, base: string): string {
  return new URL(url, base).href;
}

function toRelativeUrl(url: string, base: string): string | null {
  if (url.startsWith(base)) {
    // Add a length for "/" if `base` does not include it at the end
    return url.substr(base.endsWith("/") ? base.length : base.length + 1);
  } else {
    return null;
  }
}

function getDirectory(path: string): string {
  // Return "" if `path` does not contain "/" because `path.lastIndexOf("/")`
  // returns -1 in that case and thus `path.lastIndexOf("/") + 1 === 0`
  return path.substring(0, path.lastIndexOf("/") + 1);
}

function getQueryParameters(): {[key: string]: string} {
  return location
    .search
    .substring(1)
    .split("&")
    .map(x => x.split("="))
    .reduce((a, [k, v]) => ({...a, [k]: decodeURIComponent(v)}), {});
};

//
// Make a simple HTTP GET request.
//
function getHttp(
  url: string,
  {
    type = "text",
    header = {},
  }: {
    type?: XMLHttpRequestResponseType;
    header?: {[key: string]: string};
  } = {},
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.addEventListener("load", _ => {
      if (200 <= xhr.status && xhr.status < 300) {
        resolve(xhr.response);
      } else {
        reject(xhr);
      }
    });
    xhr.addEventListener("error", _ => reject(xhr));
    xhr.responseType = type;
    xhr.open("GET", url);
    for (const k in header) {
      xhr.setRequestHeader(k, header[k]);
    }
    xhr.send();
  });
}

//
// Make a GitHub API request to access GitHub private repositories.
//
function getGitHubPrivate(
  g: GitHubLocation,
  token: string,
  {
    type = "text",
    header = {},
  }: {
    type?: XMLHttpRequestResponseType;
    header?: {[key: string]: string};
  } = {},
): Promise<any> {
  return getHttp(
    "https://api.github.com/repos/"
      + `${g.owner}/${g.repository}/contents/${g.path}?ref=${g.commit}`,
    {
      type: type,
      header: {
        ...header,
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3.raw",
      },
    });
}

//
// If a direct HTTP GET request failed, this function automatically retries via
// a GitHub API request.
//
async function getContent(
  url: string,
  {
    gitHubToken = null,
    type = "text",
    header = {},
  }: {
    gitHubToken?: string,
    type?: XMLHttpRequestResponseType,
    header?: {[key: string]: string};
  }
): Promise<any> {
  try {
    const res = await getHttp(url, {type: type, header: header});
  } catch (e) {
    if (e instanceof XMLHttpRequest && e.status === 404 && gitHubToken) {
      const g = parseGitHubUrl(url);
      if (g) {
        return getGitHubPrivate(g, gitHubToken, {type: type})
      }
    }
    throw e;
  }
}

function parseGitHubUrl(url: string): GitHubLocation | null {
  const res = [
    new RegExp(
        "^https://raw\.githubusercontent\.com/([^/]+)/([^/]+)/([^/]+)/(.*)$"),
    new RegExp("^https://github\.com/([^/]+)/([^/]+)/blob/([^/]+)/(.*)$"),
    new RegExp("^https://github\.com/([^/]+)/([^/]+)/raw/([^/]+)/(.*)$"),
  ];

  for (const re of res) {
    const m = re.exec(url);
    if (m && m.length == 5) {
      return {owner: m[1], repository: m[2], commit: m[3], path: m[4]};
    }
  }
  return null;
}

function makeGitHubUserContentUrl(g: GitHubLocation): string {
  return "https://raw.githubusercontent.com/"
    + `${g.owner}/${g.repository}/${g.commit}/${g.path}`;
}

//
// Return a pair of the frontmatter dictionary and the string after the
// frontmatter.
//
function separateFrontmatter(s: string): [any, string] {
  const re = /\s*^---\s*$(.*?)^---\s*$(.*)/ms;
  // Since /^/m matches the beginning of each line, we check if the regex
  // matches the beginning of the whole string.
  if (s.search(re) === 0) {
    const m = re.exec(s);
    if (m && m.length == 3) {
      return [jsyaml.safeLoad(m[1]), m[2]];
    }
  }
  return [{}, s];
}

//
// Apply slide options that `Reveal.initialize()` does not handle, such as
// "theme" and "separator".
// Return the options not applied in this function.
//
function applyOptions(opts: {[key: string]: any}): {[key: string]: any} {
  if (opts.theme) {
    let e = document.createElement("link");
    e.rel = "stylesheet";
    e.type = "text/css";
    e.href = revealCdn + "css/theme/" + opts.theme + ".min.css";
    document.getElementsByTagName("head")[0].appendChild(e);
  }
  delete opts.theme;

  if (opts.separator) {
    document.getElementById("slide").dataset['separator'] = opts.separator;
  }
  delete opts.separator;

  if (opts.verticalSeparator) {
    document.getElementById("slide").dataset['separatorVertical'] =
        opts.verticalSeparator;
  }
  delete opts.verticalSeparator;

  return opts;
}

//
// If the given URL points a Blob object in GitHub private repositories, this
// function downloads the object and returns its object URL. Otherwise, this
// function just returns the given URL.
//
// FIXME: This function unnecessarily converts all the paths to an absolute
// path.
//
async function getBlobUrl(path: string, r: Request): Promise<string> {
  if (!isAbsoluteUrl(path)) {
    path = toAbsoluteUrl(path, getDirectory(r.url));
  }

  if (r.token) {
    const g = parseGitHubUrl(path);
    if (g) {
      const b = await getGitHubPrivate(g, r.token, {type: "blob"});
      return URL.createObjectURL(b);
    }
  }
  return path;
}

//
// Replace an argument of all the `url()` function in the CSS.
// The replacer function is called for each argument.
//
function replaceCssUrls(
  css: string,
  f: (url: string) => string
): string {
  return css.replace(cssUrl, (_, p1: string) => `url('${f(p1)}')`);
}

//
// `replaceCssUrls` for async replacer functions.
//
// As far as I understand, TypeScript does not allow function overloading for
// difference in function-type arguments because we cannot determine the return
// type of arguments.
//
async function replaceCssUrlsAsync(
  css: string,
  f: (url: string) => Promise<string>
): Promise<string> {
  // Remove the duplicate URLs
  const urls = new Set(
    Array.from(css.matchAll(cssUrl))
      .flatMap(m => m.length == 2 ? [m[1]] : []));
  // Evaluate all the promises concurrently.
  const pairs = await Promise.all(
    Array.from(urls).map(async url => [url, await f(url)]));
  // Make a dictionary of replacements for fast lookup.
  const d = pairs.reduce((a, [k, v]) => ({...a, [k]: v}), {});
  return replaceCssUrls(css, url => d[url]);
}

//
// Return Promise to notify the completion of CSS embedding
//
async function embedLinkedCsses(r: Request): Promise<void> {
  await Promise.all(
    Array.from(document.getElementById("slides").querySelectorAll("link"))
      .filter(e => e.rel === "stylesheet")
      .map(async e => {
        // Chrome seems to automatically replace `e.href` to an absolute URL.
        // Thus, we make the relative path and then re-make the absolute path.
        const cssurl = toAbsoluteUrl(
          toRelativeUrl(e.href, getDirectory(location.href)),
          getDirectory(r.url));
        try {
          const css = replaceCssUrls(
            await getContent(cssurl, {gitHubToken: r.token}),
            url => toAbsoluteUrl(url, getDirectory(cssurl)));
          e.insertAdjacentHTML("afterend", `<style>\n${css}\n</style>`);
          e.remove();
        } catch (err) {
          console.log(`Failed to get ${cssurl} (${e.href}):`, err);
        }
      }));
}

async function fixLocationsInTags(r: Request) {
  let ps = [];

  for (const slide of document.getElementById("slides").children) {
    for (const e of slide.getElementsByTagName("img")) {
      ps.push(
        getBlobUrl(e.getAttribute("src"), r)
          .then(url => e.setAttribute("src", url)));
    }
    for (const e of slide.getElementsByTagName("style")) {
      ps.push(
        replaceCssUrlsAsync(e.innerHTML, url => getBlobUrl(url, r))
          .then(css => e.innerHTML = css));
    }
  }

  await Promise.all(ps);
}

async function editSlides(r: Request) {
  // Use the first 'h1' element as a slide title
  document.title = document.getElementsByTagName("h1")[0].innerText;

  await embedLinkedCsses(r);
  await fixLocationsInTags(r);
}

function applyCss(md: string) {
  let el = document.createElement("div");
  el.innerHTML = md;
  document.body.appendChild(el);
  el.remove();
}

function showMarkdown(r: Request, md: string) {
  const [fm, mdbody] = separateFrontmatter(md);
  const revealConf = applyOptions({...defaultOptions, ...fm});
  document.getElementById("markdown").innerHTML = mdbody;

  // To apply CSS loaded from <link> tags in the Markdown, parse it before
  // `Reveal.initialize()`.
  // This prevents Reveal.js from generating wrong layouts when '?print-pdf' is
  // specified. If these lines are removed, Reveal.js will calculate height of
  // each page without user-speficied styles.
  applyCss(mdbody);

  Reveal.initialize({
    dependencies: [
      {src: revealCdn + "plugin/markdown/marked.js"},
      {src: revealCdn + "plugin/markdown/markdown.min.js"},
      {src: revealCdn + "plugin/notes/notes.min.js", async: true},
      {src: revealCdn + "plugin/highlight/highlight.min.js", async: true},
      {src: revealCdn + 'plugin/math/math.js', async: true},
    ],
    math: {
      mathjax:
          'https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.7/MathJax.js',
      config: 'TeX-AMS_HTML-full',
    },
    ...revealConf
  }, false);

  Reveal.addEventListener("ready", _ => editSlides(r));
}

function getInput(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

async function getMarkdown(r: Request): Promise<string> {
  const g = parseGitHubUrl(r.url);
  try {
    return await getHttp(r.url);
  } catch (err) {
    if (!(err instanceof XMLHttpRequest) || !g || err.status !== 404) {
      throw err;
    }
    // The given URL could be a private repository.
    if (r.token) {
      // The caller function handles errors thrown by `getGitHubPrivate()`.
      return await getGitHubPrivate(g, r.token);
    } else {
      throw new NoGitHubTokenError();
    }
  }
}

function submit(): boolean {
  const p = getQueryParameters();
  if (!p['url']) {
    if (getInput("input-url").value) {
      // Reload to pass the value of 'input-url' as a request parameter
      return true;
    } else {
      alert("Input a Markdown URL");
      return false;
    }
  }

  const g = parseGitHubUrl(p['url']);
  const r: Request = {
    url: g ? makeGitHubUserContentUrl(g) : p['url'],
    token: getInput("input-token").value,
  };

  // This function cannot be async because it is a handler for the 'submit'
  // event.
  getMarkdown(r)
    .then(md => {
      // Hide the NamMD from
      document.getElementById("nammd").style.display = "none";
      showMarkdown(r, md);
    })
    .catch(err => {
      if (err instanceof NoGitHubTokenError) {
        // Ask the user to input the token
        document.getElementById("div-token").style.display = "block";
        getInput("input-token").focus();
      } else if (err instanceof XMLHttpRequest) {
        alert(`Failed to get Markdown: ${err.status} ${err.statusText}.`);
      } else {
        alert(`Failed to get Markdown: ${err}.`);
      }
    });

  return false;
}

window.addEventListener("load", _ => {
  getInput("input-url").focus();

  // Multiple ways to call `submit()`
  document.getElementById("form-url").onsubmit = submit;
  document.getElementById("form-token").onsubmit = submit;
  getInput("input-token").addEventListener("keyup", e => {
    if (e.keyCode === 13) {  // 13: Enter
      submit();
    }
  });

  let p = getQueryParameters();
  if (p["url"]) {
    const e = getInput("input-url");
    e.value = p["url"];
    e.readOnly = true;
    e.disabled = true;
    submit();
  }
});

// Printing and PDF exports
var link = document.createElement("link");
link.rel = "stylesheet";
link.type = "text/css";
link.href = window.location.search.match(/print-pdf/gi)
    ? revealCdn + "css/print/pdf.min.css"
    : revealCdn + "css/print/paper.css";
document.getElementsByTagName("head")[0].appendChild(link);
