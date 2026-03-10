const fetch = require("node-fetch");
const puppeteer = require("puppeteer");
const fs = require("fs");

const site = process.env.SITE_URL || "https://example.com";

async function validateHTML() {
  const res = await fetch(`https://validator.w3.org/nu/?doc=${site}&out=json`);
  const data = await res.json();
  return data.messages;
}

async function validateCSS() {
  const res = await fetch(`https://jigsaw.w3.org/css-validator/validator?uri=${site}&output=json`);
  const data = await res.json();
  return data.cssvalidation.errors;
}

async function scanSite() {

  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  let jsErrors = [];

  page.on("pageerror", err => {
    jsErrors.push(err.message);
  });

  await page.goto(site, { waitUntil: "networkidle2" });

  const results = await page.evaluate(() => {

    const links = [...document.links].map(l => l.href);

    const css = [...document.styleSheets]
      .map(s => s.href)
      .filter(Boolean);

    const elements = [...document.querySelectorAll("*")].length;

    const inlineStyles = [...document.querySelectorAll("[style]")].length;

    return {
      links,
      css,
      elements,
      inlineStyles
    };

  });

  await browser.close();

  results.jsErrors = jsErrors;

  return results;
}

async function checkBrokenLinks(links) {

  let broken = [];

  for (let url of links) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.status >= 400) broken.push(url);
    } catch (e) {
      broken.push(url);
    }
  }

  return broken;
}

async function getSecurityHeaders() {

  const res = await fetch(site);

  const headers = [
    "content-security-policy",
    "x-frame-options",
    "x-content-type-options",
    "strict-transport-security"
  ];

  let result = {};

  headers.forEach(h => {
    result[h] = res.headers.get(h) || "missing";
  });

  return result;
}

function generateReport(data) {

  const html = `
<html>
<head>
<title>Website Audit Report</title>

<style>
body{font-family:Arial;padding:40px;background:#fafafa}
h1{color:#222}
.section{margin-top:30px}
.good{color:green}
.bad{color:red}
pre{background:#fff;padding:10px;border:1px solid #ddd}
</style>

</head>

<body>

<h1>Website Audit Report</h1>

<div class="section">
<h2>Site</h2>
${site}
</div>

<div class="section">
<h2>HTML Errors</h2>
<pre>${JSON.stringify(data.html,null,2)}</pre>
</div>

<div class="section">
<h2>CSS Errors</h2>
<pre>${JSON.stringify(data.css,null,2)}</pre>
</div>

<div class="section">
<h2>Broken Links</h2>
<pre>${JSON.stringify(data.broken,null,2)}</pre>
</div>

<div class="section">
<h2>Security Headers</h2>
<pre>${JSON.stringify(data.security,null,2)}</pre>
</div>

<div class="section">
<h2>JavaScript Errors</h2>
<pre>${JSON.stringify(data.scan.jsErrors,null,2)}</pre>
</div>

<div class="section">
<h2>CSS Files Found</h2>
<pre>${data.scan.css.join("\n")}</pre>
</div>

</body>
</html>
`;

  fs.writeFileSync("report.html", html);

}

(async () => {

  console.log("Starting Audit:", site);

  const html = await validateHTML();

  const css = await validateCSS();

  const scan = await scanSite();

  const broken = await checkBrokenLinks(scan.links);

  const security = await getSecurityHeaders();

  generateReport({
    html,
    css,
    scan,
    broken,
    security
  });

  console.log("Audit finished → report.html generated");

})();