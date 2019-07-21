var unexpected = require('unexpected');
var expressExtractHeaders = require('../lib/expressExtractHeaders');
var express = require('express');

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
  })();
}

describe('expressExtractHeaders', function() {
  var expect = unexpected
    .clone()
    .installPlugin(require('unexpected-express'))
    .installPlugin(require('unexpected-sinon'));

  it('should leave a non-text/html response alone', function() {
    return expect(
      express()
        .use(expressExtractHeaders())
        .use(function(req, res) {
          res.setHeader('Foo', 'Quux');
          res.setHeader('Content-Type', 'text/something-else');
          res.send(
            '<!DOCTYPE html>\n<html><head><meta http-equiv="Foo" content="Bar"></head><body>foo</body></html>'
          );
        }),
      'to yield exchange',
      {
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

  it('should specify response headers based on <meta> tags in the response body', function() {
    var responseHtml =
      '<!DOCTYPE html>\n<html><head><meta http-equiv="Foo" content="Bar"></head><body>foo</body></html>';
    return expect(
      express()
        .use(expressExtractHeaders())
        .use(function(req, res) {
          res.send(responseHtml);
        }),
      'to yield exchange',
      {
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

  expect.addAssertion('<string> to result in a Link header of <any>', function(
    expect,
    subject,
    value
  ) {
    return expect(
      express()
        .use(expressExtractHeaders())
        .use(function(req, res) {
          res.send(
            `<!DOCTYPE html>\n<html><head>${subject}</head><body>foo</body></html>`
          );
        }),
      'to yield exchange',
      {
        request: '/',
        response: {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            Link: value
          }
        }
      }
    );
  });

  it('should extract <link rel="preconnect">', function() {
    return expect(
      '<link rel="preconnect" href="//example.com">',
      'to result in a Link header of',
      '<//example.com>; rel=preconnect'
    );
  });

  it('should extract two link elements', function() {
    return expect(
      '<link rel="preconnect" href="//example.com">' +
        '<link rel="prefetch" href="//foobar.com">',
      'to result in a Link header of',
      ['<//example.com>; rel=preconnect', '<//foobar.com>; rel=prefetch']
    );
  });

  it('should extract three link elements', function() {
    return expect(
      '<link rel="prefetch" href="//example.com/logo-hires.jpg" as="image">' +
        '<link rel="preconnect" href="//example.com">' +
        '<link rel="prefetch" href="//foobar.com">',
      'to result in a Link header of',
      [
        '<//example.com/logo-hires.jpg>; rel=prefetch; as=image',
        '<//example.com>; rel=preconnect',
        '<//foobar.com>; rel=prefetch'
      ]
    );
  });

  it('should ignore unsupported link elements based on the rel attribute', function() {
    return expect(
      '<link rel="foobar" href="//example.com/logo-hires.jpg" as="image">',
      'to result in a Link header of',
      undefined
    );
  });

  it('should extract <LINK REL="preconnect" HREF=...>', function() {
    return expect(
      '<LINK REL="preconnect" HREF="//example.com">',
      'to result in a Link header of',
      '<//example.com>; rel=preconnect'
    );
  });

  it('should extract the "as" attribute correctly', function() {
    return expect(
      '<link rel="prefetch" href="//example.com/logo-hires.jpg" as="image">',
      'to result in a Link header of',
      '<//example.com/logo-hires.jpg>; rel=prefetch; as=image'
    );
  });

  it('should extract the "pr" attribute correctly', function() {
    return expect(
      '<link rel="prerender" href="//example.com/next-page.html" pr="0.75">',
      'to result in a Link header of',
      '<//example.com/next-page.html>; rel=prerender; pr=0.75'
    );
  });

  it('should extract the "crossorigin" attribute when it has a value', function() {
    return expect(
      '<link rel="prefetch" href="//example.com/next-page.html" as="html" crossorigin="use-credentials">',
      'to result in a Link header of',
      '<//example.com/next-page.html>; rel=prefetch; as=html; crossorigin=use-credentials'
    );
  });

  it('should extract the "crossorigin" attribute when it has no value', function() {
    return expect(
      '<link rel="prefetch" href="//example.com/next-page.html" as="html" crossorigin></head><body>foo</body></html>',
      'to result in a Link header of',
      '<//example.com/next-page.html>; rel=prefetch; as=html; crossorigin'
    );
  });

  it('should specify response headers based on <META> tags in the response body', function() {
    var responseHtml =
      '<!DOCTYPE html>\n<html><head><META HTTP-EQUIV="Foo" CONTENT="Bar"></head><body>foo</body></html>';
    return expect(
      express()
        .use(expressExtractHeaders())
        .use(function(req, res) {
          res.send(responseHtml);
        }),
      'to yield exchange',
      {
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

  it('should set an empty header when a meta tag has http-equiv, but no content attribute', function() {
    var responseHtml =
      '<!DOCTYPE html>\n<html><head><meta http-equiv="Foo"></head><body>foo</body></html>';
    return expect(
      express()
        .use(expressExtractHeaders())
        .use(function(req, res) {
          res.send(responseHtml);
        }),
      'to yield exchange',
      {
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

  it('should not break when there are other types of meta tags', function() {
    var responseHtml =
      '<!DOCTYPE html>\n<html><head><meta foo="bar"></head><body>foo</body></html>';
    return expect(
      express()
        .use(expressExtractHeaders())
        .use(function(req, res) {
          res.send(responseHtml);
        }),
      'to yield exchange',
      {
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

  it('should work with responses with chunks before, during and after </head>', function() {
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
        .use(function(req, res) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          respondWithChunks(res, responseHtmlChunks);
        }),
      'to yield exchange',
      {
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

  it('should work with responses with chunks before, during and after </head> when the request method is HEAD', function() {
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
        .use(function(req, res) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          respondWithChunks(res, responseHtmlChunks);
        }),
      'to yield exchange',
      {
        request: {
          method: 'HEAD',
          url: '/'
        },
        response: {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            Foo: 'Bar'
          },
          body: ''
        }
      }
    );
  });

  it('should work with HEAD requests', function() {
    return expect(
      express()
        .use(expressExtractHeaders())
        .use(function(req, res) {
          res.setHeader('Content-Type', 'text/html');
          if (req.method === 'HEAD') {
            res.end();
          } else {
            res.end(
              '<!DOCTYPE html>\n<html><head><meta http-equiv="Foo" content="Bar"></head><body>foo</body></html>'
            );
          }
        }),
      'to yield exchange',
      {
        request: {
          method: 'HEAD',
          url: '/'
        },
        response: {
          headers: {
            Foo: 'Bar'
          },
          body: ''
        }
      }
    );
  });

  it('should always serve the first extracted set of response headers when memoize:true is given', function() {
    var nextResponseNumber = 1;

    var app = express()
      .use(expressExtractHeaders({ memoize: true }))
      .use(function(req, res) {
        res.send(`<meta http-equiv="Foo" content="Bar${nextResponseNumber}">`);
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
    }).then(function() {
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

  it('should overwrite response headers from the upstream middleware, even when memoizing', function() {
    var app = express()
      .use(expressExtractHeaders({ memoize: true }))
      .use(function(req, res) {
        // Currently depends on the upstream middleware playing nice when the header has already been set:
        if (!res.getHeader('Content-Type')) {
          res.setHeader('Content-Type', 'text/html');
        }
        res.end(
          '<!DOCTYPE html>\n<html><head><meta http-equiv="Content-Type" content="foo/bar"></head><body>foo</body></html>'
        );
      });

    return expect(app, 'to yield exchange', {
      request: '/',
      response: {
        headers: {
          'Content-Type': 'foo/bar'
        }
      }
    }).then(function() {
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

  it('should not break if a 304 is served from upstream', function() {
    return expect(
      express()
        .use(expressExtractHeaders())
        .use(function(req, res) {
          res.status(304).end();
        }),
      'to yield exchange',
      {
        request: '/',
        response: 304
      }
    );
  });

  it('should not break if there is a parse error in the markup from upstream', function() {
    var bogusHtml = '!!!-øæåæ<>>>å112389J/)(/HJ(=/HJQ(=WE';
    return expect(
      express()
        .use(expressExtractHeaders())
        .use(function(req, res) {
          if (!res.getHeader('Content-Type')) {
            res.setHeader('Content-Type', 'text/html; charset=UTF-8');
          }
          res.end(bogusHtml);
        }),
      'to yield exchange',
      {
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

  it('should prevent the upstream middleware from delivering partial content', function() {
    return expect(
      express()
        .use(expressExtractHeaders())
        .use(
          require('serve-static')(
            require('path').resolve(__dirname, '..', 'testdata')
          )
        ),
      'to yield exchange',
      {
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

  it('should send the same extracted headers when the upstream middleware responds 304 and does not include the additional headers', function() {
    var nextId = 1;

    return expect(
      express()
        .use(expressExtractHeaders())
        .use(function(req, res) {
          if (req.headers['if-none-match']) {
            res.setHeader('ETag', req.headers['if-none-match']);
            res.status(304).end();
          } else {
            var id = nextId;
            nextId += 1;
            res.setHeader('ETag', `"foo${id}"`);
            res.setHeader('Content-Type', 'text/html; charset=UTF-8');
            res.end(
              `<!DOCTYPE html>\n<html><head><meta http-equiv="Foo" content="Bar${id}"></head><body>foo</body></html>`
            );
          }
        }),
      'to yield exchange',
      {
        request: 'GET /',
        response: {
          statusCode: 200,
          headers: {
            Foo: 'Bar1',
            ETag: '"foo1"'
          }
        }
      }
    )
      .and('to yield exchange', {
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
      })
      .and('to yield exchange', {
        request: 'GET /',
        response: {
          statusCode: 200,
          headers: {
            ETag: '"foo2"',
            Foo: 'Bar2'
          }
        }
      })
      .and('to yield exchange', {
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

  it('should remove an X-Frame-Options meta tag from the response, and lift it up as an HTTP response header', function() {
    return expect(
      express()
        .use(expressExtractHeaders())
        .use(function(req, res) {
          res.send(
            '<!DOCTYPE html>\n<html><head><meta http-equiv="X-Frame-Options" content="SAMEORIGIN"></head><body>foo</body></html>'
          );
        }),
      'to yield exchange',
      {
        request: '/',
        response: {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Frame-Options': 'SAMEORIGIN'
          },
          body: '<!DOCTYPE html>\n<html><head></head><body>foo</body></html>'
        }
      }
    );
  });

  it('should remove an X-Frame-Options meta tag from the response, and lift it up as an HTTP response header, even when the meta tag has the /> closing marker (grrr)', function() {
    return expect(
      express()
        .use(expressExtractHeaders())
        .use(function(req, res) {
          res.send(
            '<!DOCTYPE html>\n<html><head><meta http-equiv="X-Frame-Options" content="SAMEORIGIN" /></head><body>foo</body></html>'
          );
        }),
      'to yield exchange',
      {
        request: '/',
        response: {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Frame-Options': 'SAMEORIGIN'
          },
          body: '<!DOCTYPE html>\n<html><head></head><body>foo</body></html>'
        }
      }
    );
  });

  it('should remove two X-Frame-Options meta tags from the response', function() {
    return expect(
      express()
        .use(expressExtractHeaders())
        .use(function(req, res) {
          res.send(
            '<!DOCTYPE html>\n<html><head><meta http-equiv="X-Frame-Options" content="SAMEORIGIN" /><title>thetitle</title><meta http-equiv="X-Frame-Options" content="SAMEORIGIN" /></head><body>foo</body></html>'
          );
        }),
      'to yield exchange',
      {
        request: '/',
        response: {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Frame-Options': 'SAMEORIGIN'
          },
          body:
            '<!DOCTYPE html>\n<html><head><title>thetitle</title></head><body>foo</body></html>'
        }
      }
    );
  });

  expect.addAssertion('<array> to come out as <string>', function(
    expect,
    subject,
    value
  ) {
    var app = express()
      .use(expressExtractHeaders({ memoize: true }))
      .use(function(req, res) {
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('ETag', '"foo"');
        if (req.headers['if-none-match'] === '"foo"') {
          res.status(304).end();
        } else {
          subject.forEach(function(chunk) {
            res.write(chunk);
          });
          res.end();
        }
      });
    return expect(app, 'to yield exchange', {
      request: '/',
      response: {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Frame-Options': 'SAMEORIGIN'
        },
        body: value
      }
    }).then(function() {
      // Check that we get the same result on a subsequent request
      return expect(app, 'to yield exchange', {
        request: '/',
        response: {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Frame-Options': 'SAMEORIGIN'
          },
          body: value
        }
      });
    });
  });

  it('should omit two meta tags that reside in separate chunks ', function() {
    return expect(
      [
        '<!DOCTYPE html>\n<html><head><meta http-equiv="X-Frame-Options" content="SAMEORIGIN" />',
        '<title>thetitle</title><meta http-equiv="X-Frame-Options" content="SAMEORIGIN" /></head><body>foo</body></html>'
      ],
      'to come out as',
      '<!DOCTYPE html>\n<html><head><title>thetitle</title></head><body>foo</body></html>'
    );
  });

  it('should omit a meta tag that is split across two chunks', function() {
    return expect(
      [
        '<!DOCTYPE html>\n<html><head><meta http-equiv="X-Frame-Options" content="SAMEORIG',
        'IN" /><title>thetitle</title><meta http-equiv="X-Frame-Options" content="SAMEORIGIN" /></head><body>foo</body></html>'
      ],
      'to come out as',
      '<!DOCTYPE html>\n<html><head><title>thetitle</title></head><body>foo</body></html>'
    );
  });

  it('should omit a meta tag that fully occupies a single chunk', function() {
    return expect(
      [
        '<!DOCTYPE html>\n<html><head>',
        '<meta http-equiv="X-Frame-Options" content="SAMEORIGIN" />',
        '<title>thetitle</title></head><body>foo</body></html>'
      ],
      'to come out as',
      '<!DOCTYPE html>\n<html><head><title>thetitle</title></head><body>foo</body></html>'
    );
  });

  it('should omit a meta tag spread across three chunks', function() {
    return expect(
      [
        '<!DOCTYPE html>\n<html><head><meta ',
        'http-equiv="X-Frame-Options" content="SAMEORIGIN"',
        ' /><title>thetitle</title></head><body>foo</body></html>'
      ],
      'to come out as',
      '<!DOCTYPE html>\n<html><head><title>thetitle</title></head><body>foo</body></html>'
    );
  });

  it('should adjust Content-Length when omitting ranges', function() {
    var app = express()
      .use(expressExtractHeaders({ memoize: true }))
      .use(function(req, res) {
        res.set('Content-Length', '114');
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.write(
          '<!DOCTYPE html>\n<html><head><meta http-equiv="X-Frame-Options" content="SAMEORIGIN"></head><body>foo</body></html>'
        );
        res.end();
      });
    return expect(app, 'to yield exchange', {
      request: '/',
      response: {
        headers: {
          'Content-Length': 114 - 56
        }
      }
    }).then(function() {
      return expect(app, 'to yield exchange', {
        request: '/',
        response: {
          headers: {
            'Content-Length': 114 - 56
          }
        }
      });
    });
  });

  it('should adjust Content-Length when omitting ranges, even when it has been provided as a number', function() {
    var app = express()
      .use(expressExtractHeaders({ memoize: true }))
      .use(function(req, res) {
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Length', 114); // Doesn't coerce to string in node.js 6.3.0
        res.write(
          '<!DOCTYPE html>\n<html><head><meta http-equiv="X-Frame-Options" content="SAMEORIGIN"></head><body>foo</body></html>'
        );
        res.end();
      });
    return expect(app, 'to yield exchange', {
      request: '/',
      response: {
        headers: {
          'Content-Length': 114 - 56
        }
      }
    }).then(function() {
      return expect(app, 'to yield exchange', {
        request: '/',
        response: {
          headers: {
            'Content-Length': 114 - 56
          }
        }
      });
    });
  });

  it('should convert newlines to spaces when serving headers', function() {
    var app = express()
      .use(expressExtractHeaders({ memoize: true }))
      .use(function(req, res) {
        res.set('Content-Length', '114');
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.write(
          '<!DOCTYPE html>\n<html><head><meta http-equiv="Content-Security-Policy" content="\n' +
            "default-src 'none';\n" +
            "script-src 'self';\n" +
            "style-src 'self';\n" +
            '"></head><body>foo</body></html>'
        );
        res.end();
      });
    return expect(app, 'to yield exchange', {
      request: '/',
      response: {
        headers: {
          'Content-Security-Policy':
            "default-src 'none'; script-src 'self'; style-src 'self';"
        }
      }
    });
  });
});
