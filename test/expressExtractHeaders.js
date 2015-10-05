/*global describe, it*/
var unexpected = require('unexpected'),
    expressExtractHeaders = require('../lib/expressExtractHeaders'),
    express = require('express');

function respondWithChunks(res, chunks) {
    var nextChunkNumber = 0;
    (function sendNextChunkOrEnd() {
        if (nextChunkNumber < chunks.length) {
            res.write(chunks[nextChunkNumber]);
            nextChunkNumber += 1;
            setImmediate(sendNextChunkOrEnd);
        } else {
            res.end();
        }
    }());
}

describe('expressExtractHeaders', function () {
    var expect = unexpected.clone()
        .installPlugin(require('unexpected-express'))
        .installPlugin(require('unexpected-sinon'));

    it('should leave a non-text/html response alone', function () {
        return expect(
            express()
                .use(expressExtractHeaders())
                .use(function (req, res) {
                    res.setHeader('Foo', 'Quux');
                    res.setHeader('Content-Type', 'text/something-else');
                    res.send('<!DOCTYPE html>\n<html><head><meta http-equiv="Foo" content="Bar"></head><body>foo</body></html>');
                }),
            'to yield exchange', {
                request: '/',
                response: {
                    headers: {
                        'Content-Type': 'text/something-else; charset=utf-8',
                        Foo: 'Quux'
                    }
                }
            }
        );
    });

    it('should specify response headers based on <meta> tags in the response body', function () {
        var responseHtml =
            '<!DOCTYPE html>\n<html><head><meta http-equiv="Foo" content="Bar"></head><body>foo</body></html>';
        return expect(
            express()
                .use(expressExtractHeaders())
                .use(function (req, res) {
                    res.send(responseHtml);
                }),
            'to yield exchange', {
                request: '/',
                response: {
                    headers: {
                        'Content-Type': 'text/html; charset=utf-8',
                        Foo: 'Bar'
                    },
                    body: responseHtml
                }
            }
        );
    });

    it('should specify response headers based on <META> tags in the response body', function () {
        var responseHtml =
            '<!DOCTYPE html>\n<html><head><META HTTP-EQUIV="Foo" CONTENT="Bar"></head><body>foo</body></html>';
        return expect(
            express()
                .use(expressExtractHeaders())
                .use(function (req, res) {
                    res.send(responseHtml);
                }),
            'to yield exchange', {
                request: '/',
                response: {
                    headers: {
                        'Content-Type': 'text/html; charset=utf-8',
                        Foo: 'Bar'
                    },
                    body: responseHtml
                }
            }
        );
    });

    it('should set an empty header when a meta tag has http-equiv, but no content attribute', function () {
        var responseHtml =
            '<!DOCTYPE html>\n<html><head><meta http-equiv="Foo"></head><body>foo</body></html>';
        return expect(
            express()
                .use(expressExtractHeaders())
                .use(function (req, res) {
                    res.send(responseHtml);
                }),
            'to yield exchange', {
                request: '/',
                response: {
                    headers: {
                        'Content-Type': 'text/html; charset=utf-8',
                        Foo: ''
                    },
                    body: responseHtml
                }
            }
        );
    });

    it('should not break when there are other types of meta tags', function () {
        var responseHtml =
            '<!DOCTYPE html>\n<html><head><meta foo="bar"></head><body>foo</body></html>';
        return expect(
            express()
                .use(expressExtractHeaders())
                .use(function (req, res) {
                    res.send(responseHtml);
                }),
            'to yield exchange', {
                request: '/',
                response: {
                    headers: {
                        'Content-Type': 'text/html; charset=utf-8'
                    },
                    body: responseHtml
                }
            }
        );
    });

    it('should work with responses with chunks before, during and after </head>', function () {
        var responseHtmlChunks = [
            '<!DOCTYPE html>\n',
            '<html><head><META ',
            'HTTP-EQUIV="Foo" CONTENT="Bar">',
            '</head><body>',
            'foo</body></html>'
        ];
        return expect(
            express()
                .use(expressExtractHeaders())
                .use(function (req, res) {
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    respondWithChunks(res, responseHtmlChunks);
                }),
            'to yield exchange', {
                request: '/',
                response: {
                    headers: {
                        'Content-Type': 'text/html; charset=utf-8',
                        Foo: 'Bar'
                    },
                    body: responseHtmlChunks.join('')
                }
            }
        );
    });

    it('should work with responses with chunks before, during and after </head> when the request method is HEAD', function () {
        var responseHtmlChunks = [
            '<!DOCTYPE html>\n',
            '<html><head><META ',
            'HTTP-EQUIV="Foo" CONTENT="Bar">',
            '</head><body>',
            'foo</body></html>'
        ];
        return expect(
            express()
                .use(expressExtractHeaders())
                .use(function (req, res) {
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    respondWithChunks(res, responseHtmlChunks);
                }),
            'to yield exchange', {
                request: {
                    method: 'HEAD',
                    url: '/'
                },
                response: {
                    headers: {
                        'Content-Type': 'text/html; charset=utf-8',
                        Foo: 'Bar'
                    },
                    body: undefined
                }
            }
        );
    });

    it('should work with HEAD requests', function () {
        return expect(
            express()
                .use(expressExtractHeaders())
                .use(function (req, res) {
                    res.setHeader('Content-Type', 'text/html');
                    if (req.method === 'HEAD') {
                        res.end();
                    } else {
                        res.end('<!DOCTYPE html>\n<html><head><meta http-equiv="Foo" content="Bar"></head><body>foo</body></html>');
                    }
                }),
            'to yield exchange', {
                request: {
                    method: 'HEAD',
                    url: '/'
                },
                response: {
                    headers: {
                        Foo: 'Bar'
                    },
                    body: undefined
                }
            }
        );
    });

    it('should always serve the first extracted set of response headers when memoize:true is given', function () {
        var nextResponseNumber = 1,
            app = express()
                .use(expressExtractHeaders({memoize: true}))
                .use(function (req, res) {
                    res.send('<meta http-equiv="Foo" content="Bar' + nextResponseNumber + '">');
                    nextResponseNumber += 1;
                });

        return expect(app, 'to yield exchange', {
            request: '/',
            response: {
                headers: {
                    'Content-Type': 'text/html; charset=utf-8',
                    Foo: 'Bar1'
                }
            }
        }).then(function () {
            return expect(app, 'to yield exchange', {
                request: '/',
                response: {
                    headers: {
                        'Content-Type': 'text/html; charset=utf-8',
                        Foo: 'Bar1'
                    }
                }
            });
        });
    });

    it('should overwrite response headers from the upstream middleware, even when memoizing', function () {
        var app = express()
            .use(expressExtractHeaders({memoize: true}))
            .use(function (req, res) {
                // Currently depends on the upstream middleware playing nice when the header has already been set:
                if (!res.getHeader('Content-Type')) {
                    res.setHeader('Content-Type', 'text/html');
                }
                res.end('<!DOCTYPE html>\n<html><head><meta http-equiv="Content-Type" content="foo/bar"></head><body>foo</body></html>');
            });

        return expect(app, 'to yield exchange', {
            request: '/',
            response: {
                headers: {
                    'Content-Type': 'foo/bar'
                }
            }
        }).then(function () {
            return expect(app, 'to yield exchange', {
                request: '/',
                response: {
                    headers: {
                        'Content-Type': 'foo/bar'
                    }
                }
            });
        });
    });

    it('should not break if a 304 is served from upstream', function () {
        return expect(
            express()
                .use(expressExtractHeaders())
                .use(function (req, res) {
                    res.status(304).end();
                }),
            'to yield exchange', {
                request: '/',
                response: 304
            }
        );
    });

    it('should not break if there is a parse error in the markup from upstream', function () {
        var bogusHtml = '!!!-øæåæ<>>>å112389J/)(/HJ(=/HJQ(=WE';
        return expect(
            express()
                .use(expressExtractHeaders())
                .use(function (req, res) {
                    if (!res.getHeader('Content-Type')) {
                        res.setHeader('Content-Type', 'text/html; charset=UTF-8');
                    }
                    res.end(bogusHtml);
                }),
            'to yield exchange', {
                request: '/',
                response: {
                    headers: {
                        'Content-Type': 'text/html; charset=UTF-8'
                    },
                    body: bogusHtml
                }
            }
        );
    });

    it('should prevent the upstream middleware from delivering partial content', function () {
        return expect(
            express()
                .use(expressExtractHeaders())
                .use(require('serve-static')(require('path').resolve(__dirname, '..', 'testdata'))),
            'to yield exchange', {
                request: {
                    url: '/foo.txt',
                    headers: {
                        Range: 'bytes=2-2'
                    }
                },
                response: {
                    statusCode: 200,
                    headers: {
                        'Content-Type': 'text/plain; charset=UTF-8',
                        'Content-Range': undefined
                    },
                    body: 'This is the complete foo.txt/EOF\n'
                }
            }
        );
    });

    it('should send the same extracted headers when the upstream middleware responds 304 and does not include the additional headers', function () {
        var nextId = 1;

        return expect(express()
            .use(expressExtractHeaders())
            .use(function (req, res) {
                if (req.headers['if-none-match']) {
                    res.setHeader('ETag', req.headers['if-none-match']);
                    res.status(304).end();
                } else {
                    var id = nextId;
                    nextId += 1;
                    res.setHeader('ETag', '"foo' + id + '"');
                    res.setHeader('Content-Type', 'text/html; charset=UTF-8');
                    res.end('<!DOCTYPE html>\n<html><head><meta http-equiv="Foo" content="Bar' + id + '"></head><body>foo</body></html>');
                }
            }),
            'to yield exchange', {
                request: 'GET /',
                response: {
                    statusCode: 200,
                    headers: {
                        Foo: 'Bar1',
                        ETag: '"foo1"'
                    }
                }
            }).and('to yield exchange', {
                request: {
                    url: 'GET /',
                    headers: {
                        'If-None-Match': '"foo1"'
                    }
                },
                response: {
                    statusCode: 304,
                    headers: {
                        ETag: '"foo1"',
                        Foo: 'Bar1'
                    }
                }
            }).and('to yield exchange', {
                request: 'GET /',
                response: {
                    statusCode: 200,
                    headers: {
                        ETag: '"foo2"',
                        Foo: 'Bar2'
                    }
                }
            }).and('to yield exchange', {
                request: {
                    url: 'GET /',
                    headers: {
                        'If-None-Match': '"foo2"'
                    }
                },
                response: {
                    statusCode: 304,
                    headers: {
                        ETag: '"foo2"',
                        Foo: 'Bar2'
                    }
                }
            });
    });
});
