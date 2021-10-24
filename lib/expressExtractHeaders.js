const hijackResponse = require('hijackresponse');

const HtmlParser = require('htmlparser2').Parser;

const RangeOmittingStream = require('./RangeOmittingStream');

module.exports = function (config) {
  config = config || {};

  const memoize = config.memoize;
  const previousResultByUrl = {};

  return function expressExtractHeaders(req, res, next) {
    const previousResult = previousResultByUrl[req.url];
    const isHead = req.method === 'HEAD';
    if (
      previousResult &&
      memoize &&
      (previousResult.omitRanges.length === 0 || isHead)
    ) {
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

      hijackResponse(res, next).then(({ readable, writable }) => {
        if (
          previousResult &&
          previousResult.headers.etag &&
          previousResult.headers.etag === res.getHeader('ETag') &&
          (previousResult.omitRanges.length === 0 ||
            !/^W\//.test(previousResult.headers.etag))
        ) {
          res.set(previousResult.headers);
          if (previousResult.omitRanges.length > 0) {
            return readable
              .pipe(new RangeOmittingStream(previousResult.omitRanges))
              .pipe(writable);
          } else {
            return readable.pipe(writable);
          }
        }

        if (/^text\/html(?:;|\s|$)/i.test(res.getHeader('Content-Type'))) {
          // https://github.com/fb55/htmlparser2/issues/991#issuecomment-950325704
          readable.setEncoding('utf-8');

          const headers = {};
          const omitRanges = [];
          let stillParsing = true;
          const chunks = [];

          const stopParsingAndSendResponse = function () {
            if (stillParsing) {
              stillParsing = false;
              const contentLength = res.getHeader('Content-Length');
              if (typeof contentLength !== 'undefined') {
                let contentLengthAdjustment = 0;
                omitRanges.forEach(function (omitRange) {
                  contentLengthAdjustment += omitRange[1] - omitRange[0];
                });
                if (contentLengthAdjustment) {
                  headers['content-length'] = String(
                    parseInt(contentLength, 10) - contentLengthAdjustment
                  );
                }
              }
              res.set(headers);
              headers.etag = res.getHeader('ETag');
              previousResultByUrl[req.url] = {
                headers: headers,
                omitRanges: omitRanges,
              };
              if (omitRanges.length > 0) {
                const rangeOmittingStream = new RangeOmittingStream(omitRanges);
                rangeOmittingStream.pipe(writable);
                chunks.forEach(function (chunk) {
                  rangeOmittingStream.write(chunk);
                });
              } else {
                chunks.forEach(function (chunk) {
                  writable.write(chunk);
                });
              }
            }
          };

          const htmlParser = new HtmlParser({
            onopentag: function (name, attribs) {
              if (stillParsing) {
                if (name === 'meta') {
                  const httpEquiv = attribs['http-equiv'];
                  if (typeof httpEquiv === 'string') {
                    if (attribs.content) {
                      // Normalize whitespace, convert newlines to spaces so they'll work
                      // in an HTTP header:
                      headers[httpEquiv] = attribs.content
                        .replace(/\s/g, ' ')
                        .trim();
                    } else {
                      headers[httpEquiv] = '';
                    }
                    if (
                      /^(?:X-Frame-Options|Content-Security-Policy(?:-Report-Only)?)$/i.test(
                        httpEquiv
                      )
                    ) {
                      omitRanges.push([
                        htmlParser.startIndex,
                        htmlParser.endIndex + 1,
                      ]);
                    }
                  }
                } else if (name === 'link') {
                  const rel = attribs.rel;
                  const href = attribs.href;
                  const as = attribs.as;
                  const pr = attribs.pr;
                  const crossorigin = attribs.crossorigin;
                  if (
                    typeof href === 'string' &&
                    /^(?:preconnect|prefetch|prerender|preload|dns-prefetch)$/i.test(
                      rel
                    )
                  ) {
                    let linkHeaderValue = `<${href}>; rel=${rel}`;
                    if (as) {
                      linkHeaderValue += `; as=${as}`;
                    }
                    if (pr) {
                      linkHeaderValue += `; pr=${pr}`;
                    }
                    if (typeof crossorigin === 'string') {
                      linkHeaderValue += `; crossorigin${
                        crossorigin ? `=${crossorigin}` : ''
                      }`;
                    }
                    if (Array.isArray(headers.link)) {
                      headers.link.push(linkHeaderValue);
                    } else if (headers.link) {
                      headers.link = [headers.link, linkHeaderValue];
                    } else {
                      headers.link = linkHeaderValue;
                    }
                  }
                }
              }
            },
            onclosetag: function (name) {
              if (name === 'head') {
                stopParsingAndSendResponse();
              }
            },
          });

          readable
            .on('data', function (chunk) {
              if (stillParsing) {
                if (!isHead) {
                  chunks.push(chunk);
                }
                htmlParser.write(chunk);
              } else if (!isHead) {
                writable.write(chunk);
              }
            })
            .on('end', function () {
              stopParsingAndSendResponse();
              writable.end();
            });
        } else {
          readable.pipe(writable);
        }
      });
    }
  };
};
