require('express-hijackresponse');

var HtmlParser = require('htmlparser2').Parser;

module.exports = function (config) {
    config = config || {};

    var memoize = config.memoize,
        headerValueByHeaderNameByUrl = {};

    return function expressExtractHeaders(req, res, next) {
        var headerValueByHeaderName = memoize && headerValueByHeaderNameByUrl[req.url];
        if (headerValueByHeaderName) {
            res.set(headerValueByHeaderName);
            next();
        } else {
            var isHead = req.method === 'HEAD';
            if (isHead) {
                // Rewrite to GET so we can retrieve the response from the upstream middleware and
                // still get the correct headers:
                req.method = 'GET';
            }
            delete req.headers.range;
            delete req.headers['if-range'];
            res.hijack(function (err, res) {
                if (/^text\/html(?:;|\s|$)/i.test(res.getHeader('Content-Type'))) {
                    headerValueByHeaderName = {};
                    var stillParsing = true,
                        htmlParser = new HtmlParser({
                            onopentag: function (name, attribs) {
                                if (stillParsing && name === 'meta') {
                                    if ('http-equiv' in attribs) {
                                        headerValueByHeaderName[attribs['http-equiv']] = attribs.content || '';
                                    }
                                }
                            },
                            onclosetag: function (name) {
                                if (name === 'head') {
                                    stopParsingAndSendResponse();
                                }
                            }
                        }),
                        chunks = [];
                    res.on('data', function (chunk) {
                        if (stillParsing) {
                            if (!isHead) {
                                chunks.push(chunk);
                            }
                            htmlParser.write(chunk);
                        } else if (!isHead) {
                            res.write(chunk);
                        }
                    }).on('end', function () {
                        stopParsingAndSendResponse();
                        res.end();
                    });

                    var stopParsingAndSendResponse = function () {
                        if (stillParsing) {
                            stillParsing = false;
                            res.set(headerValueByHeaderName);
                            if (memoize) {
                                headerValueByHeaderNameByUrl[req.url] = headerValueByHeaderName;
                            }
                            chunks.forEach(function (chunk) {
                                res.write(chunk);
                            });
                        }
                    };
                } else {
                    res.unhijack();
                }
            });
            next();
        }
    };
};
