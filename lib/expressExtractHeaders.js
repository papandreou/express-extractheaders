var hijackResponse = require('hijackresponse');

var HtmlParser = require('htmlparser2-papandreou').Parser;

module.exports = function (config) {
    config = config || {};

    var memoize = config.memoize,
        previousHeadersByUrl = {};

    return function expressExtractHeaders(req, res, next) {
        var previousHeaders = previousHeadersByUrl[req.url];
        if (previousHeaders && memoize) {
            res.set(previousHeaders);
            next();
        } else {
            var isHead = req.method === 'HEAD';
            if (isHead) {
                // Rewrite to GET so we can retrieve the response from the upstream middleware and
                // still get the correct previousHeaders:
                req.method = 'GET';
            }
            delete req.headers.range;
            delete req.headers['if-range'];
            hijackResponse(res, function (err, res) {
                if (err) {
                    res.unhijack();
                    return next(err);
                } else if (previousHeaders && previousHeaders.etag && previousHeaders.etag === res.getHeader('ETag')) {
                    res.set(previousHeaders);
                    return res.unhijack();
                }

                if (/^text\/html(?:;|\s|$)/i.test(res.getHeader('Content-Type'))) {
                    var headers = {};
                    var stillParsing = true,
                        htmlParser = new HtmlParser({
                            onopentag: function (name, attribs) {
                                if (stillParsing && name === 'meta') {
                                    if ('http-equiv' in attribs) {
                                        headers[attribs['http-equiv']] = attribs.content || '';
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
                            res.set(headers);
                            headers.etag = res.getHeader('ETag');
                            previousHeadersByUrl[req.url] = headers;
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
