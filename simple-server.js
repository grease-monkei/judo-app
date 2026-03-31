const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const root = process.cwd();

const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

http.createServer((req, res) => {
    let urlPath = req.url;
    if (urlPath === '/') urlPath = '/index.html';
    
    // Remote any query params
    urlPath = urlPath.split('?')[0];

    const filePath = path.join(root, urlPath.replace(/\//g, path.sep));

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end(`Not Found: ${urlPath}`);
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        res.end(data);
    });
}).listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});
