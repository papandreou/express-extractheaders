/*global describe, it*/
var unexpected = require('unexpected'),
    expressExtractHeaders = require('../lib/expressExtractHeaders'),
    express = require('express'),
    passError = require('passerror');

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
            'to be middleware that processes', {
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
            'to be middleware that processes', {
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
            'to be middleware that processes', {
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
            'to be middleware that processes', {
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
            'to be middleware that processes', {
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
                    'to be middleware that processes', {
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
            'to be middleware that processes', {
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
                    'to be middleware that processes', {
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
});
