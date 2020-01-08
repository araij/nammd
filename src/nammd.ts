import * as jsyaml from 'js-yaml';

declare var Reveal: any;

const revealCdn = "//cdnjs.cloudflare.com/ajax/libs/reveal.js/3.8.0/";

const defaultOptions = {
  theme: "white",
};

// リクエストパラメータを取得
function getRequestParameters(): {[index: string]: string} {
  return location.search.substring(1).split("&").reduce((acc, cur) => {
    const element = cur.split("=");
    acc[decodeURIComponent(element[0])] = decodeURIComponent(element[1]);
    return acc;
  }, {});
};

interface GetHttpOptions  {
  type?: any;
  header?: any;
  onerror?: any;
}

function getHttp(
    url,
    onload,
    {
      type = "text",
      header = {},
      onerror = undefined,
    }: GetHttpOptions) {
  let xhr = new XMLHttpRequest();
  xhr.addEventListener("load", () => onload(xhr));
  xhr.addEventListener("error", () => {
    if (onerror) {
      onerror(xhr);
    } else {
      alert("Error: the server responded with " +
          `${xhr.status} ${xhr.statusText}`);
    }
  });
  xhr.responseType = type;
  xhr.open("GET", url);
  for (let k in header) {
    xhr.setRequestHeader(k, header[k]);
  }
  xhr.send();
}

function getGitHubContents(owner, repo, path, token, onload, type = "text") {
  // https://stackoverflow.com/a/42724593
  getHttp(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    onload,
    {
      type: type,
      header: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3.raw",
      },
    });
}

function parseGitHubUrl(url) {
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

function separateFrontMatter(str) {
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

function applyOptions(opts) {
  if (opts.theme) {
    let link = document.createElement("link");
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = revealCdn + "css/theme/" + opts.theme + ".min.css";
    document.getElementsByTagName("head")[0].appendChild(link);
  }
}

// Replace a relative path with an absolute URL
function fixImagePath(path, params, callback) {
  if (path.match(/^(https?:)?\/\//)) {
    callback(path);
    return;
  }

  const dir = params.slide.substring(0, params.slide.lastIndexOf("/"));
  // Use a personal access token if it is given
  if ("token" in params) {
    const g = parseGitHubUrl(dir);
    getGitHubContents(
        g.owner,
        g.repository,
        `${g.path}/${path}`,
        params.token,
        (xhr) => callback(URL.createObjectURL(xhr.response)),
        "blob");
  } else {
    callback(dir + "/" + path);
  }
}

function showMarkdown(params, md) {
  const [fm, mdbody] = separateFrontMatter(md);

  applyOptions({...defaultOptions, ...fm});
  document.getElementById("markdown").innerHTML = mdbody;

  Reveal.initialize({
    dependencies: [
      {src: revealCdn + "plugin/markdown/marked.js"},
      {src: revealCdn + "plugin/markdown/markdown.min.js"},
      {src: revealCdn + "plugin/notes/notes.min.js", async: true},
      {src: revealCdn + "plugin/highlight/highlight.min.js", async: true}
    ]
  }, false);

  Reveal.addEventListener("ready", (event) => {
    // Use the first 'h1' element as a slide title
    document.title = document.getElementsByTagName("h1")[0].innerText;
    // Fix img.src to relative path from index.html
    let es: any = document.getElementsByTagName("img");
    for (let e of es) {
      fixImagePath(
          e.getAttribute("src"), params, (url) => e.setAttribute("src", url));
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
  getHttp(
    params.slide,
    (xhr) => {
      if (xhr.status == 200) {
        showMarkdown(params, xhr.responseText);
      } else {
        alert(`Failed to get Markdown: ${xhr.status} ${xhr.statusText}.`);
      }
    },
    {
      onerror: (xhr) => {
        const gh = parseGitHubUrl(params.slide);
        if (gh) {
          if (!params.token) {
            params.token = window.prompt("A network error occured. \n" +
                "If the Markdown file is in a GitHub private repository, " +
                "retry with a personal access token:");
          }
          if (params.token) {
            getGitHubContents(gh.owner, gh.repository, gh.path, params.token,
                (x) => showMarkdown(params, x.responseText));
          }
        }
      },
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

