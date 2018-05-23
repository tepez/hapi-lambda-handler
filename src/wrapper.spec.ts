import * as Hapi from 'hapi'
import { handlerFromServer, IInjectOptions } from './index'


interface ISpec {
    event: any
    context: any

    injectOptions: IInjectOptions
    mockRoute: Hapi.RouteConfiguration
    server: Hapi.Server
    serverToWrap: Hapi.Server | Promise<Hapi.Server>

    injectLambda: () => Promise<Object>
    handlerRes: any
    handlerResBody: any
}

describe('.handlerFromServer()', () => {
    let spec: ISpec;
    afterEach(() => spec = null);
    beforeEach(function () {
        spec = this;

        spec.injectOptions = {};
        spec.context = {};

        spec.event = spec.event = {
            resource: '/health',
            path: '/health',
            httpMethod: 'GET',
            headers: {
                'mock-header': 'mock-value',
                'user-agent': 'mock-user-agent',
                host: 'mock-host',
            },
            queryStringParameters: null,
            pathParameters: null,
            stageVariables: null,
            requestContext: {
                // ...
            },
            body: '',
            isBase64Encoded: false,
        };

        spec.injectLambda = () => {
            const handler = handlerFromServer(spec.serverToWrap, spec.injectOptions);
            return new Promise((resolve, reject) => {
                handler(spec.event, spec.context, (err, res) => {
                    if (err) {
                        reject(err);
                    } else {
                        spec.handlerRes = res as Object;
                        if (spec.handlerRes.body) {
                            spec.handlerResBody = JSON.parse(spec.handlerRes.body);
                        }
                        resolve();
                    }
                });
            });
        };

        spec.mockRoute = {
            method: 'GET',
            path: '/health',
            handler: function (request, reply) {
                reply({ status: 'ok' })
            },
        };

        spec.server = new Hapi.Server();
        spec.server.connection({});

        spec.serverToWrap = spec.server;
    });

    describe('when given a promise to a server', () => {
        it('should inject when ready', (done) => {
            const okInitPlugin = {
                register: (server, options, next) => {
                    process.nextTick(() => {
                        spec.server.route(spec.mockRoute);
                        next();
                    });
                },
            };
            (okInitPlugin.register as any).attributes = {
                name: 'mock-ok-init-plugin',
            };

            spec.serverToWrap = spec.server.register(okInitPlugin)
                .then(() => spec.server)
                .catch((err) => {
                    done.fail(err);
                    return Promise.reject(err);
                });

            spec.injectLambda().then(() => {
                expect(spec.handlerRes.statusCode).toBe(200);
                expect(spec.handlerResBody).toEqual({
                    status: 'ok',
                })
            }).then(done, done.fail);
        });

        it('should return 500 when there is an initialization error', async () => {
            const initErrorPlugin = {
                register: (server, options, next) => {
                    process.nextTick(() => next(new Error('mock-init-error')));
                },
            };
            (initErrorPlugin.register as any).attributes = {
                name: 'mock-init-error-plugin',
            };

            spec.serverToWrap = spec.server.register(initErrorPlugin)
                .then(() => spec.server)
                .catch((err) => {
                    // This is where you should handle, i.e. log, server init errors
                    expect(err).toEqual(new Error('mock-init-error'));
                    console.log(`Server init error: ${err.message}`);
                    return Promise.reject(err);
                });

            await spec.injectLambda();
            expect(spec.handlerRes.statusCode).toBe(500);
            expect(spec.handlerResBody).toEqual({
                statusCode: 500,
                error: 'Internal Server Error',
                message: 'An internal server error occurred (Server initialization error)',
            });
        });
    });

    describe('when given a server', () => {
        describe('query string parameters', () => {
            beforeEach(() => {
                spec.mockRoute.handler = (request, reply) => {
                    reply({ query: request.query });
                };
                spec.server.route(spec.mockRoute);
            });

            describe('when there are no query string parameters', () => {
                it('should pass empty query to hapi', async () => {
                    await spec.injectLambda();
                    expect(spec.handlerRes.statusCode).toBe(200);
                    expect(spec.handlerResBody).toEqual({
                        query: {},
                    });
                });
            });

            describe('when there are query string parameters', () => {
                it('should pass them to hapi', async () => {
                    spec.event.queryStringParameters = {
                        key1: 'value1',
                        key2: 'value2',
                    };

                    await spec.injectLambda();
                    expect(spec.handlerRes.statusCode).toBe(200);
                    expect(spec.handlerResBody).toEqual({
                        query: {
                            key1: 'value1',
                            key2: 'value2',
                        },
                    });
                });
            });
        });

        describe('headers', () => {
            it('should remove the accept-encoding header from the request', async () => {
                spec.event.headers['accept-encoding'] = 'gzip';
                spec.mockRoute.handler = (request, reply) => {
                    reply({ headers: request.headers })
                };
                spec.server.route(spec.mockRoute);

                await spec.injectLambda();
                expect(spec.handlerRes.statusCode).toBe(200);
                expect(spec.handlerResBody).toEqual({
                    headers: {
                        'mock-header': 'mock-value',
                        'user-agent': 'mock-user-agent',
                        host: 'mock-host',
                    },
                });
            });

            it('should remove the transfer-encoding header from the response', async () => {
                spec.mockRoute.handler = (request, reply) => {
                    reply({ status: 'ok' })
                    // explicitly add the header
                        .header('transfer-encoding', 'chunked')
                        // add another header just for the sake of it
                        .header('mock-response-header', 'value');
                };
                spec.server.route(spec.mockRoute);

                await spec.injectLambda();
                expect(spec.handlerRes.statusCode).toBe(200);
                expect(spec.handlerRes.headers).toEqual({
                    'content-type': 'application/json; charset=utf-8',
                    'cache-control': 'no-cache',
                    'content-length': 15,
                    vary: 'accept-encoding',
                    date: jasmine.any(String),
                    connection: 'keep-alive',
                    'mock-response-header': 'value',
                    'accept-ranges': 'bytes',
                });
                expect(spec.handlerResBody).toEqual({ status: 'ok' })
            });

            it('should NOT fail when given headers=null', async () => {
                spec.server.route(spec.mockRoute);
                spec.event.headers = null;

                await spec.injectLambda();
                expect(spec.handlerRes.statusCode).toBe(200);
                expect(spec.handlerRes.headers).toEqual({
                    'content-type': 'application/json; charset=utf-8',
                    'cache-control': 'no-cache',
                    'content-length': 15,
                    vary: 'accept-encoding',
                    date: jasmine.any(String),
                    connection: 'keep-alive',
                    'accept-ranges': 'bytes',
                });
                expect(spec.handlerResBody).toEqual({ status: 'ok' })
            });
        });

        describe('request tail', () => {
            it('should wait for request tail before returning', (done) => {
                let tailDone;
                let lambdaReturned: boolean = false;

                spec.mockRoute.handler = (request, reply) => {
                    tailDone = request.tail('mock-tail');

                    setTimeout(() => {
                        if (lambdaReturned) {
                            done.fail('Lambda returned before tail has finished');
                        } else {
                            tailDone();
                        }
                    }, 1000); // A second should be enough for the lambda to return if
                    // it didn't wait for the tail

                    reply({});
                };
                spec.server.route(spec.mockRoute);

                spec.injectLambda().then(() => {
                    lambdaReturned = true;
                    expect(spec.handlerRes.statusCode).toBe(200);
                    expect(spec.handlerResBody).toEqual({})
                }).then(done, done.fail);
            });
        });

        describe('basePath', () => {
            beforeEach(() => {
                spec.server.route(spec.mockRoute);
                spec.event.path = `/mock-base-path${spec.event.path}`;
            });

            it('should strip basePath from the event URL', async () => {
                spec.injectOptions.basePath = '/mock-base-path';

                await spec.injectLambda();
                expect(spec.handlerRes.statusCode).toBe(200);
                expect(spec.handlerResBody).toEqual({
                    status: 'ok',
                })

            });

            it(`should return 404 if we don't provide the basePath`, async () => {
                await spec.injectLambda();
                expect(spec.handlerRes.statusCode).toBe(404);
                expect(spec.handlerResBody).toEqual({
                    statusCode: 404,
                    error: 'Not Found',
                    message: 'Not Found',
                })
            });
        });

        describe('modifyRequest function', () => {
            it('should call it before injecting the request', async () => {
                spec.mockRoute.handler = (request, reply) => {
                    reply({ credentials: request.auth.credentials });
                };
                spec.server.route(spec.mockRoute);

                spec.injectOptions.modifyRequest = (event, context, request) => {
                    expect(event).toBe(spec.event);
                    expect(context).toBe(spec.context);
                    expect(request).toEqual({
                        method: 'GET',
                        url: '/health',
                        headers: {
                            'mock-header': 'mock-value',
                            'user-agent': 'mock-user-agent',
                            host: 'mock-host',
                        },
                    });

                    request.credentials = 'mock-user'
                };

                await spec.injectLambda();
                expect(spec.handlerRes.statusCode).toBe(200);
                expect(spec.handlerResBody).toEqual({
                    credentials: 'mock-user',
                })
            });
        });
    });
});
