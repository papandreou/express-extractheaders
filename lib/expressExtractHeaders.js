var hijackResponse = require('hijackresponse');

var HtmlParser = require('htmlparser2-papandreou').Parser;

var RangeOmittingStream = require('./RangeOmittingStream');

module.exports = function (config) {
    config = config || {};

    var memoize = config.memoize,
        previousResultByUrl = {};

    return function expressExtractHeaders(req, res, next) {
        var previousResult = previousResultByUrl[req.url];
        var isHead = req.method === 'HEAD';
        if (previousResult && memoize && (previousResult.omitRanges.length === 0 || isHead)) {
            res.set(previousResult.headers);
            next();
        } else {
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
                } else if (previousResult && previousResult.headers.etag && previousResult.headers.etag === res.getHeader('ETag') && (previousResult.omitRanges.length === 0 || !/^W\//.test(previousResult.headers.etag))) {
                    res.set(previousResult.headers);
                    if (previousResult.omitRanges.length > 0) {
                        return res.pipe(new RangeOmittingStream(previousResult.omitRanges)).pipe(res);
                    } else {
                        return res.unhijack();
                    }
                }

                if (/^text\/html(?:;|\s|$)/i.test(res.getHeader('Content-Type'))) {
                    var headers = {};
                    var omitRanges = [];
                    var stillParsing = true,
                        htmlParser = new HtmlParser({
                            onopentag: function (name, attribs) {
                                if (stillParsing && name === 'meta') {
                                    var httpEquiv = attribs['http-equiv']
                                    if (typeof httpEquiv === 'string') {
                                        headers[httpEquiv] = attribs.content || '';
                                        if (/^(?:X-Frame-Options|Content-Security-Policy(?:-Report-Only)?)$/i.test(httpEquiv)) {
                                            omitRanges.push([htmlParser.startIndex, htmlParser.endIndex + 1]);
                                        }
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
                            previousResultByUrl[req.url] = {
                                headers: headers,
                                omitRanges: omitRanges
                            };

                            var rangeOmittingStream = new RangeOmittingStream(omitRanges);
                            rangeOmittingStream.pipe(res);
                            chunks.forEach(function (chunk) {
                                rangeOmittingStream.write(chunk);
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
