const revealCdn = "//cdnjs.cloudflare.com/ajax/libs/reveal.js/3.8.0/";

// リクエストパラメータを取得
function getRequestParameters() {
  return location.search.substring(1).split("&").reduce((acc, cur) => {
    const element = cur.split("=");
    acc[decodeURIComponent(element[0])] = decodeURIComponent(element[1]);
    return acc;
  }, {});
};

function getGHContents(owner, repo, path, token, callback, type = "text") {
  // https://stackoverflow.com/a/42724593
  let xhr = new XMLHttpRequest();
  xhr.responseType = type;
  xhr.onreadystatechange = function () {
    if (xhr.readyState == XMLHttpRequest.DONE && xhr.status == 200) {
      callback(xhr);
    }
  };
  xhr.open(
      "GET",
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      true);
  xhr.setRequestHeader("Authorization", `token ${token}`);
  xhr.setRequestHeader("Accept", "application/vnd.github.v3.raw");
  xhr.send();
}

function decomposeGitHubURL(url) {
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

function showMarkdown(parameters, md) {
  let markdownUrl = parameters["slide"];

  let opt = {theme: "white"};

  // Obtain the YAML front matter
  const re = /\s*^---\s*$(.*?)^---\s*$(.*)/ms;

  let mdbody = md;
  if (md.search(re) == 0) {
    const mat = re.exec(md);
    if (mat && mat.length == 3) {
      opt = {...opt, ...jsyaml.load(mat[1])};
      mdbody = mat[2];
    }
  }

  if (opt.theme) {
    let link = document.createElement("link");
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = revealCdn + "css/theme/" + opt.theme + ".min.css";
    document.getElementsByTagName("head")[0].appendChild(link);
  }

  // Slide指定
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
    // タイトル設定
    document.title = document.getElementsByTagName("h1")[0].innerText;

    // fix img.src to relative path from index.html
    const url = location.href.replace(/\?.*$/,"");
    const mainPath = url.substring(0, url.lastIndexOf("/"));
    const markDownDirPath =
        markdownUrl.substring(0, markdownUrl.lastIndexOf("/"));
    Array.from(document.getElementsByTagName("img"), el => {
      const imagePath = el.getAttribute("src");
      const relativePath = imagePath.split(mainPath)[1];
      if (!relativePath && imagePath.match(/^(https?:)?\/\//)) {
        // another domain and absolute path case
        return;
      }
      if ("token" in parameters) {
        const repoinfo = decomposeGitHubURL(markDownDirPath);
        getGHContents(
            repoinfo.owner,
            repoinfo.repository,
            `${repoinfo.path}/${imagePath}`,
            parameters.token,
            (xhr) => el.setAttribute("src", URL.createObjectURL(xhr.response)),
            "blob");
      } else {
        const result = relativePath ?
            markDownDirPath + relativePath :
            markDownDirPath + "/" + imagePath;
        el.setAttribute("src", result);
      }
    });
  });
}

function getMarkdown(parameters) {
  let xhr = new XMLHttpRequest();
  xhr.addEventListener("error", () => {
    const gh = decomposeGitHubURL(parameters.slide);
    if (gh) {
      if (!parameters.token) {
        parameters.token = window.prompt("A network error occured. \n" +
            "If the Markdown file is in a GitHub private repository, " +
            "retry with a personal access token:");
      }
      if (parameters.token) {
        getGHContents(gh.owner, gh.repository, gh.path, parameters.token,
            (x) => showMarkdown(parameters, x.responseText));
      }
    }
  });
  xhr.addEventListener("load", () => {
    if (xhr.status == 200) {
      showMarkdown(parameters, xhr.responseText);
    } else {
      alert(`Error: the server responded with ${xhr.status} ` +
          `${xhr.statusText}.`);
    }
  });
  xhr.open("GET", parameters.slide);
  xhr.send();
};

window.addEventListener("load", () => {
  let parameters = getRequestParameters();
  while (!parameters.slide) {
    parameters.slide = window.prompt(
        "Input a Markdown URL",
        "https://araij.github.io/nammd/example/slide1.md");
  }
  getMarkdown(parameters);
});

// Printing and PDF exports
var link = document.createElement("link");
link.rel = "stylesheet";
link.type = "text/css";
link.href = window.location.search.match(/print-pdf/gi)
    ? revealCdn + "css/print/pdf.min.css"
    : revealCdn + "css/print/paper.css";
document.getElementsByTagName("head")[0].appendChild(link);

