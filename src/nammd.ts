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
  owner: string,
  repo: string,
  path: string,
  token: string,
  type: XMLHttpRequestResponseType = "text",
): Promise<any> {
  // https://stackoverflow.com/a/42724593
  return getHttp(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    {
      type: type,
      header: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3.raw",
      },
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
  ];

  for (const re of res) {
    const mat = re.exec(url);
    if (mat.length == 5) {
      return {owner: mat[1], repository: mat[2], commit: mat[3], path: mat[4]};
    }
  }
  return null;
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

// Replace a relative path with an absolute URL
async function getImagePath(
  path: string,
  params: Parameter
): Promise<string> {
  if (path.match(/^(https?:)?\/\//)) {
    return path;
  }

  const dir = params.url.substring(0, params.url.lastIndexOf("/"));
  // Use a personal access token if it is given
  if (!params.token) {
    return dir + "/" + path;
  }

  const g = parseGitHubUrl(dir);
  const res = await getGitHubContents(
      g.owner, g.repository, `${g.path}/${path}`, params.token, "blob");
  return URL.createObjectURL(res);
}

function editSlides(params: Parameter) {
  // Use the first 'h1' element as a slide title
  document.title = document.getElementsByTagName("h1")[0].innerText;

  // Fix 'src' of 'img' elements to relative path from index.html
  for (const e of document.getElementsByTagName("img")) {
    getImagePath(e.getAttribute("src"), params)
      .then(url => e.setAttribute("src", url));
  }

  // Fix URLs in user-specified 'style' tags to relative path from index.html
  // FIXME: Ad-hoc code!!
  const dir = params.url.substring(0, params.url.lastIndexOf("/"));
  for (const slide of document.getElementById("slides").children) {
    for (const style of slide.getElementsByTagName("style")) {
      const re = /url\(['"](?!http)(.*)['"]\)/g;
      let d = {};
      Promise.all(
        Array.from(style.innerHTML.matchAll(re))
          .filter(m => m.length >= 2)
          .map(m => getImagePath(m[1], params).then(url => { d[m[1]] = url; }))
      ).then(() => {
        style.innerHTML = style.innerHTML.replace(
            re,
            (_, p1: string) => {
              if (d[p1].startsWith("blob:")) {
                return `url('${d[p1]}')`;
              } else {
                return `url('${dir}/${d[p1]}')`;
              }
            });
      });
    }
  }
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

  const p: Parameter = {
    url: params['url'],
    token: getInput("input-token").value,
  };

  getHttp(p.url)
    .then(res => showMarkdown(p, res))
    .catch(xhr => {
      if (xhr.status === 0) {
        const gh = parseGitHubUrl(p.url);
        if (gh) {
          if (p.token) {
            getGitHubContents(gh.owner, gh.repository, gh.path, p.token)
              .then(res => showMarkdown(p, res));
          } else {
            document.getElementById("div-token").style.display = "block";
            getInput("input-token").focus();
          }
          return;
        }
      }

      alert(`Failed to get Markdown: ${xhr.status} ${xhr.statusText}.`);
    });

  return false;
}

window.addEventListener("load", () => {
  getInput("input-url").focus();

  document.getElementById("form-url").onsubmit = submit;
  document.getElementById("form-token").onsubmit = submit;
  getInput("input-token").addEventListener("keyup", e => {
    if (e.keyCode === 13) {  // 13: Enter
      (document.getElementById("form-token") as HTMLFormElement).submit();
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
