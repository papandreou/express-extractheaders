/*global describe, it*/
var unexpected = require('unexpected'),
    expressExtractHeaders = require('../lib/expressExtractHeaders'),
    express = require('express'),
    passError = require('passerror');

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

    it('should leave a non-text/html response alone', function (done) {
        expect(
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
            },
            done
        );
    });

    it('should specify response headers based on <meta> tags in the response body', function (done) {
        var responseHtml =
            '<!DOCTYPE html>\n<html><head><meta http-equiv="Foo" content="Bar"></head><body>foo</body></html>';
        expect(
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
            },
            done
        );
    });

    it('should specify response headers based on <META> tags in the response body', function (done) {
        var responseHtml =
            '<!DOCTYPE html>\n<html><head><META HTTP-EQUIV="Foo" CONTENT="Bar"></head><body>foo</body></html>';
        expect(
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
            },
            done
        );
    });

    it('should set an empty header when a meta tag has http-equiv, but no content attribute', function (done) {
        var responseHtml =
            '<!DOCTYPE html>\n<html><head><meta http-equiv="Foo"></head><body>foo</body></html>';
        expect(
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
            },
            done
        );
    });

    it('should not break when there are other types of meta tags', function (done) {
        var responseHtml =
            '<!DOCTYPE html>\n<html><head><meta foo="bar"></head><body>foo</body></html>';
        expect(
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
            },
            done
        );
    });

    it('should work with responses with chunks before, during and after </head>', function (done) {
        var responseHtmlChunks = [
            '<!DOCTYPE html>\n',
            '<html><head><META ',
            'HTTP-EQUIV="Foo" CONTENT="Bar">',
            '</head><body>',
            'foo</body></html>'
        ];
        expect(
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
            },
            done
        );
    });

    it('should work with responses with chunks before, during and after </head> when the request method is HEAD', function (done) {
        var responseHtmlChunks = [
            '<!DOCTYPE html>\n',
            '<html><head><META ',
            'HTTP-EQUIV="Foo" CONTENT="Bar">',
            '</head><body>',
            'foo</body></html>'
        ];
        expect(
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
                    body: new Buffer([])
                }
            },
            done
        );
    });

    it('should work with HEAD requests', function (done) {
        expect(
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
                    body: new Buffer([])
                }
            },
            done
        );
    });

    it('should always serve the first extracted set of response headers when memoize:true is given', function (done) {
        var nextResponseNumber = 1,
            app = express()
            .use(expressExtractHeaders({memoize: true}))
            .use(function (req, res) {
                res.send('<meta http-equiv="Foo" content="Bar' + nextResponseNumber + '">');
                nextResponseNumber += 1;
            });
        expect(
            app,
            'to yield exchange', {
                request: '/',
                response: {
                    headers: {
                        'Content-Type': 'text/html; charset=utf-8',
                        Foo: 'Bar1'
                    }
                }
            },
            passError(done, function () {
                expect(
                    app,
                    'to yield exchange', {
                        request: '/',
                        response: {
                            headers: {
                                'Content-Type': 'text/html; charset=utf-8',
                                Foo: 'Bar1'
                            }
                        }
                    },
                    done
                );
            }));
    });

    it('should overwrite response headers from the upstream middleware, even when memoizing', function (done) {
        var app = express()
            .use(expressExtractHeaders({memoize: true}))
            .use(function (req, res) {
                // Currently depends on the upstream middleware playing nice when the header has already been set:
                if (!res.getHeader('Content-Type')) {
                    res.setHeader('Content-Type', 'text/html');
                }
                res.end('<!DOCTYPE html>\n<html><head><meta http-equiv="Content-Type" content="foo/bar"></head><body>foo</body></html>');
            });
        expect(
            app,
            'to yield exchange', {
                request: '/',
                response: {
                    headers: {
                        'Content-Type': 'foo/bar'
                    }
                }
            },
            passError(done, function () {
                expect(
                    app,
                    'to yield exchange', {
                        request: '/',
                        response: {
                            headers: {
                                'Content-Type': 'foo/bar'
                            }
                        }
                    },
                    done
                );
            })
        );
    });

    it('should not break if a 304 is served from upstream', function (done) {
        expect(
            express()
                .use(expressExtractHeaders())
                .use(function (req, res) {
                    res.status(304).end();
                }),
            'to yield exchange', {
                request: '/',
                response: 304
            },
            done
        );
    });

    it('should not break if there is a parse error in the markup from upstream', function (done) {
        var bogusHtml = '!!!-øæåæ<>>>å112389J/)(/HJ(=/HJQ(=WE';
        expect(
            express()
                .use(expressExtractHeaders())
                .use(function (req, res) {
                    if (!res.getHeader('Content-Type')) {
                        res.setHeader('Content-Type', 'text/html');
                    }
                    res.end(bogusHtml);
                }),
            'to yield exchange', {
                request: '/',
                response: {
                    headers: {
                        'Content-Type': 'text/html'
                    },
                    body: bogusHtml
                }
            },
            done
        );
    });

    it.skip('should prevent the upstream middleware from delivering partial content', function (done) {
        expect(
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
            },
            done
        );
    });
});
