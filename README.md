# express-extractheaders

[![NPM version](https://badge.fury.io/js/express-extractheaders.png)](http://badge.fury.io/js/express-extractheaders)
[![Build Status](https://travis-ci.org/papandreou/express-extractheaders.png?branch=master)](https://travis-ci.org/papandreou/express-extractheaders)
[![Coverage Status](https://coveralls.io/repos/papandreou/express-extractheaders/badge.png)](https://coveralls.io/r/papandreou/express-extractheaders)
[![Dependency Status](https://david-dm.org/papandreou/express-extractheaders.png)](https://david-dm.org/papandreou/express-extractheaders)

Express middleware that allows you to specify your HTTP response headers inside the `<head>` of your HTML as `<meta http-equiv="..." content="...">` tags. The primary use case is static HTML, but the middleware works no matter what's actually generating the response body, so it'll also work with template engines, http proxies etc.

## Usage

```js
require('express')()
  .use(require('express-extractheaders')(options))
  .use(express.static('/path/to/static/files/'));
```

Example:

```js
require('express')()
  .use(require('express-extractheaders')())
  .use(function (req, res, next) {
    res.end(
      '<html>' +
        '<head>' +
        '<meta http-equiv="X-Frame-Options" content="SAMEORIGIN">' +
        '</head>' +
        '<body>foo</body>' +
        '</html>'
    );
  })
  .listen(1337);
```

```
$ curl --dump-header - localhost:1337
HTTP/1.1 200 OK
X-Powered-By: Express
Content-Type: text/html; charset=utf-8
Content-Length: 98
X-Frame-Options: SAMEORIGIN
Date: Sun, 27 Jul 2014 12:16:51 GMT
Connection: keep-alive

<html><head><meta http-equiv="X-Frame-Options" content="SAMEORIGIN"></head><body>foo</body></html>
```

## Installation

```
npm install express-extractheaders
```

## Options

`memoize`: Only extract the response headers once per url. You will probably want to use this option in production as there's a performance hit to parsing all the outgoing HTML.

## Security considerations

Only use this when you trust the downstream middleware. If you proxy to an untrusted host, it will gain the ability to set response headers on the behalf of your server.

## Releases

[Changelog](https://github.com/papandreou/express-extractheaders/blob/master/CHANGELOG.md)

## License

express-extractheaders is licensed under a standard 3-clause BSD license -- see the
`LICENSE` file for details.
