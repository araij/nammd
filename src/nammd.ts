import * as jsyaml from 'js-yaml';

declare var Reveal: any;

const revealCdn = "//cdnjs.cloudflare.com/ajax/libs/reveal.js/3.8.0/";

const defaultOptions = {
  theme: "white",
  separator: "^\r?\n---\r?\n$",
  verticalSeparator: "^\r?\n--\r?\n$",
};

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
    for (let k in header) {
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
): Promise<XMLHttpRequest> {
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
  const re = new RegExp(
      "^https://github\.com/([^/]+)/([^/]+)/raw/([^/]+)/(.*)$");
  const mat = re.exec(url);
  if (mat.length == 5) {
    return {
      owner: mat[1],
      repository: mat[2],
      commit: mat[3],
      path: mat[4],
    };
  } else {
    return null;
  }
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
  params: {[key: string]: string}
): Promise<string> {
  if (path.match(/^(https?:)?\/\//)) {
    return path;
  }

  const dir = params.slide.substring(0, params.slide.lastIndexOf("/"));
  // Use a personal access token if it is given
  if (!("token" in params)) {
    return dir + "/" + path;
  }

  const g = parseGitHubUrl(dir);
  const xhr = await getGitHubContents(
      g.owner, g.repository, `${g.path}/${path}`, params.token, "blob");
  return URL.createObjectURL(xhr.response);
}

function showMarkdown(params: {[key: string]: string}, md: string) {
  const [fm, mdbody] = separateFrontMatter(md);

  const revealConf = applyOptions({...defaultOptions, ...fm});
  document.getElementById("markdown").innerHTML = mdbody;

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

  Reveal.addEventListener("ready", (event: any) => {
    // Use the first 'h1' element as a slide title
    document.title = document.getElementsByTagName("h1")[0].innerText;

    // Fix 'src' of 'img' elements to relative path from index.html
    for (let e of document.getElementsByTagName("img") as any) {
      getImagePath(e.getAttribute("src"), params)
        .then((url) => e.setAttribute("src", url));
    }

    // Fix URLs in user-specified 'style' tags to relative path from index.html
    // FIXME: Ad-hoc code!!
    const dir = params.slide.substring(0, params.slide.lastIndexOf("/"));
    let slides: any = document.getElementById("slides").children;
    for (let slide of slides) {
      let styles: any = slide.getElementsByTagName("style");
      for (let style of styles) {
        style.innerHTML = style.innerHTML.replace(
          /url\(['"](?!http)(.*)['"]\)/,
          `url('${dir}/$1')`
        );
      }
    }
  });
}

window.addEventListener("load", () => {
  let params = getRequestParameters();
  while (!params.slide) {
    params.slide = window.prompt(
        "Input a Markdown URL",
        "https://araij.github.io/nammd/example/slide1.md");
  }
  getHttp(params.slide)
    .then((res) => showMarkdown(params, res))
    .catch((xhr) => {
      if (xhr.status != 0) {
        alert(`Failed to get Markdown: ${xhr.status} ${xhr.statusText}.`);
        return;
      }

      const gh = parseGitHubUrl(params.slide);
      if (gh) {
        if (!params.token) {
          params.token = window.prompt("A network error occured. \n" +
              "If the Markdown file is in a GitHub private repository, " +
              "retry with a personal access token:");
        }
        if (params.token) {
          getGitHubContents(gh.owner, gh.repository, gh.path, params.token)
            .then((xhr) => showMarkdown(params, xhr.responseText));
        }
      }
    });
});

// Printing and PDF exports
var link = document.createElement("link");
link.rel = "stylesheet";
link.type = "text/css";
link.href = window.location.search.match(/print-pdf/gi)
    ? revealCdn + "css/print/pdf.min.css"
    : revealCdn + "css/print/paper.css";
document.getElementsByTagName("head")[0].appendChild(link);
