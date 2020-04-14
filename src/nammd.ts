import * as jsyaml from 'js-yaml';

declare var Reveal: any;

const revealCdn = "//cdnjs.cloudflare.com/ajax/libs/reveal.js/3.8.0/";

const defaultOptions = {
  theme: "white",
  separator: "^\r?\n---\r?\n$",
  verticalSeparator: "^\r?\n--\r?\n$",
};

interface Parameter {
  url: string;
  token?: string;
}

function getRequestParameters(): {[key: string]: string} {
  return location.search.substring(1).split("&").reduce((acc, cur) => {
    const element = cur.split("=");
    acc[decodeURIComponent(element[0])] = decodeURIComponent(element[1]);
    return acc;
  }, {});
};

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
    let xhr = new XMLHttpRequest();
    xhr.addEventListener("load", () => {
      if (200 <= xhr.status && xhr.status < 300) {
        resolve(xhr.response);
      } else {
        reject(xhr);
      }
    });
    xhr.addEventListener("error", () => reject(xhr));
    xhr.responseType = type;
    xhr.open("GET", url);
    for (const k in header) {
      xhr.setRequestHeader(k, header[k]);
    }
    xhr.send();
  });
}

function getGitHubContents(
  g: GitHubRepository,
  token: string,
  type: XMLHttpRequestResponseType = "text",
): Promise<any> {
  // https://stackoverflow.com/a/42724593
  return getHttp(
    `https://api.github.com/repos/`
        + `${g.owner}/${g.repository}/contents/${g.path}?ref=${g.commit}`,
    {
      type: type,
      header: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3.raw",
      },
    });
}

function getWebContents(
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
): Promise<string> {
  return getHttp(url, {type: type, header: header})
    .catch(xhr => {
      if (xhr.status === 404 && gitHubToken) {
        const g = parseGitHubUrl(url);
        if (g) {
          return getGitHubContents(g, gitHubToken, type)
        }
      }
      throw xhr;
    });
}

interface GitHubRepository {
  owner: string,
  repository: string,
  commit: string,
  path: string,
}

function parseGitHubUrl(url: string): GitHubRepository | null {
  const res = [
    new RegExp("^https://github\.com/([^/]+)/([^/]+)/blob/([^/]+)/(.*)$"),
    new RegExp("^https://github\.com/([^/]+)/([^/]+)/raw/([^/]+)/(.*)$"),
    new RegExp(
        "^https://raw\.githubusercontent\.com/([^/]+)/([^/]+)/([^/]+)/(.*)$"),
  ];

  for (const re of res) {
    const mat = re.exec(url);
    if (mat && mat.length == 5) {
      return {owner: mat[1], repository: mat[2], commit: mat[3], path: mat[4]};
    }
  }
  return null;
}

function makeGitHubUserContentUrl(gh: GitHubRepository): string {
  return "https://raw.githubusercontent.com/"
      + `${gh.owner}/${gh.repository}/${gh.commit}/${gh.path}`;
}

function separateFrontMatter(
  str: string,
): [{[key: string]: string}, string] {
  const re = /\s*^---\s*$(.*?)^---\s*$(.*)/ms;
  // Since /^/m matches the beginning of each line, we check if the regex
  // matches the beginning of the whole string.
  if (str.search(re) == 0) {
    const mat = re.exec(str);
    if (mat && mat.length == 3) {
      return [jsyaml.load(mat[1]), mat[2]];
    }
  }
  return [{}, str];
}

function applyOptions(opts: {[key: string]: any}): {[key: string]: any} {
  if (opts.theme) {
    let link = document.createElement("link");
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = revealCdn + "css/theme/" + opts.theme + ".min.css";
    document.getElementsByTagName("head")[0].appendChild(link);
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

function isAbsoluteUrl(url: string) {
  return url.match(/^(https?:)?\/\//);
}

// Replace a relative path with an absolute URL
async function getImagePath(
  path: string,
  params: Parameter
): Promise<string> {
  if (!isAbsoluteUrl(path)) {
    path = toAbsoluteUrl(path, getDirectory(params.url));
  }

  if (params.token) {
    const g = parseGitHubUrl(path);
    if (g) {
      const res = await getGitHubContents(g, params.token, "blob");
      return URL.createObjectURL(res);
    }
  }
  return path;
}

// FIXME: define non-promise overload
//   (css: string, f: (url: string) => string) => string
function replaceCssUrls(
  css: string,
  f: (url: string) => Promise<string>
): Promise<string> {
  // FIXME: sophisticate the regex to handle line breaks and long one-liner
  const cssUrl = /url\(['"](.*)['"]\)/g;
  const urls = new Set(
    Array.from(css.matchAll(cssUrl))
      .flatMap(m => m.length == 2 ? [m[1]] : []));

  return Promise.all(
    Array.from(urls).map(orig => f(orig).then(conv => [orig, conv]))
  ).then(pairs => {
    const d = pairs.reduce((acc, [k, v]) => ({...acc, [k]: v}), {});
    return css.replace(cssUrl, (_, p1: string) => `url('${d[p1]}')`);
  });
}

function getDirectory(path: string): string {
  return path.substring(0, path.lastIndexOf("/"));
}

function toAbsoluteUrl(url: string, base: string): string {
  // FIXME: remove redundancy in the path (e.g., "a/b/../../")
  if (isAbsoluteUrl(url)) {
    return url;
  } else if (base.endsWith("/")) {
    return base + url;
  } else {
    return base + "/" + url;
  }
}

function toRelativeUrl(url: string, base: string): string {
  if (!base.endsWith("/")) {
    base += "/";
  }
  return url.startsWith(base) ? url.substr(base.length) : url;
}

// Return Promise to notify the completion of CSS embedding
async function embedLinkedCsses(p: Parameter) {
  return Promise.all(
    Array.from(document.getElementById("slides").querySelectorAll("link"))
      .filter(e => e.rel === "stylesheet")
      .map(async e => {
        // Chrome seems to automatically replace `e.href` to an absolute URL.
        // Thus, we make the relative path and then re-make the absolute path.
        const cssurl = toAbsoluteUrl(
          toRelativeUrl(e.href, getDirectory(location.href)),
          getDirectory(p.url));
        return getWebContents(cssurl, {gitHubToken: p.token})
          .then(resp =>
            replaceCssUrls(resp, url =>
              Promise.resolve(toAbsoluteUrl(url, getDirectory(cssurl)))))
          .then(css => {
            e.insertAdjacentHTML("afterend", `<style>\n${css}\n</style>`);
            e.remove();
          })
          .catch(err => {
            console.log(`Failed to get ${cssurl} (${e.href}):`, err);
          });
      }))
    .then(_ => { /* return void */ });
}

function fixLocationsInTags(p: Parameter) {
  const dir = p.url.substring(0, p.url.lastIndexOf("/"));

  for (const slide of document.getElementById("slides").children) {
    // Fix 'src' of 'img' elements to relative path from index.html
    for (const e of slide.getElementsByTagName("img")) {
      getImagePath(e.getAttribute("src"), p)
        .then(url => e.setAttribute("src", url));
    }

    for (const e of slide.getElementsByTagName("style")) {
      replaceCssUrls(e.innerHTML, url => getImagePath(url, p))
        .then(css => e.innerHTML = css);
    }
  }
}

async function editSlides(p: Parameter) {
  // Use the first 'h1' element as a slide title
  document.title = document.getElementsByTagName("h1")[0].innerText;

  await embedLinkedCsses(p);
  fixLocationsInTags(p);
}

function showMarkdown(params: Parameter, md: string) {
  // Hide the from
  document.getElementById("nammd").style.display = "none";

  const [fm, mdbody] = separateFrontMatter(md);
  const revealConf = applyOptions({...defaultOptions, ...fm});
  document.getElementById("markdown").innerHTML = mdbody;

  // To apply CSS loaded from <link> tags in the Markdown, parse it before
  // `Reveal.initialize()`.
  // This prevents Reveal.js from generating wrong layouts when '?print-pdf' is
  // specified. If these lines are removed, Reveal.js will calculate height of
  // each page without user-speficied styles.
  let el = document.createElement("div");
  el.innerHTML = mdbody;
  document.body.appendChild(el);
  el.remove();

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

  Reveal.addEventListener("ready", _ => editSlides(params));
}

function getInput(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

function showNotFoundError(xhr: XMLHttpRequest) {
  alert(`Failed to get Markdown: ${xhr.status} ${xhr.statusText}.`);
}

function submit(): boolean {
  const params = getRequestParameters();
  if (!params['url']) {
    if (getInput("input-url").value) {
      // Reload to pass the value of 'input-url' as a request parameter
      return true;
    } else {
      alert("Input a Markdown URL");
      return false;
    }
  }

  const gh = parseGitHubUrl(params['url']);
  const p: Parameter = {
    url: gh ? makeGitHubUserContentUrl(gh) : params['url'],
    token: getInput("input-token").value,
  };

  getHttp(p.url)
    .then(res => showMarkdown(p, res))
    .catch(xhr => {
      if (!gh || xhr.status !== 404) {
        showNotFoundError(xhr);
        return;
      }
      // The given URL could be a private repository.
      if (p.token) {
        getGitHubContents(gh, p.token)
          .then(res => showMarkdown(p, res))
          .catch(xhr => showNotFoundError(xhr));
      } else {
        document.getElementById("div-token").style.display = "block";
        getInput("input-token").focus();
      }
    });

  return false;
}

window.addEventListener("load", () => {
  getInput("input-url").focus();

  // Multiple ways to call `submit()`
  document.getElementById("form-url").onsubmit = submit;
  document.getElementById("form-token").onsubmit = submit;
  getInput("input-token").addEventListener("keyup", e => {
    if (e.keyCode === 13) {  // 13: Enter
      submit();
    }
  });

  let params = getRequestParameters();
  if (params.url) {
    const e = getInput("input-url");
    e.value = params.url;
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
