import { APIGatewayEvent, APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda'
import { Plugin, Server, ServerRoute } from 'hapi'
import { handlerFromServer, IInjectOptions, IRequestWithTailPromises } from './index'


interface ISpec {
    event: APIGatewayProxyEvent
    context: Context

    injectOptions: IInjectOptions
    mockRoute: ServerRoute
    server: Server
    serverToWrap: Server | Promise<Server>

    injectLambda: () => Promise<void>
    handlerRes: APIGatewayProxyResult
    handlerResBody: any
}

describe('.handlerFromServer()', () => {
    let spec: ISpec;
    afterEach((): void => spec = null);
    beforeEach(function (this: ISpec) {
        spec = this;

        spec.injectOptions = {};
        spec.context = {
            awsRequestId: 'mock-aws-request-id',
        } as Context;

        spec.event = {
            resource: '/health',
            path: '/health',
            httpMethod: 'GET',
            headers: {
                'mock-header': 'mock-value',
                'user-agent': 'mock-user-agent',
                host: 'mock-host',
            },
            multiValueHeaders: {
                'mock-header': [
                    'mock-value',
                ],
                'user-agent': [
                    'mock-user-agent',
                ],
                host: [
                    'mock-host',
                ],
            },
            multiValueQueryStringParameters: null,
            queryStringParameters: null,
            pathParameters: null,
            stageVariables: null,
            requestContext: null,
            body: '',
            isBase64Encoded: false,
        } as APIGatewayProxyEvent;


        spec.injectLambda = async () => {
            const handler = handlerFromServer(spec.serverToWrap, spec.injectOptions);

            spec.handlerRes = await handler(
                spec.event as APIGatewayEvent,
                spec.context as Context,
            ) as APIGatewayProxyResult;
            if (spec.handlerRes.body) {
                spec.handlerResBody = JSON.parse(spec.handlerRes.body);
            }
        };

        spec.mockRoute = {
            method: 'GET',
            path: '/health',
            handler: () => ({ status: 'ok' }),
        };

        spec.server = new Server({
            compression: false,
        });

        spec.serverToWrap = spec.server;
    });

    describe('when given a promise to a server', () => {
        it('should inject when ready', (done) => {
            const okInitPlugin: Plugin<void> = {
                name: 'okInitPlugin',
                register: () => {
                    spec.server.route(spec.mockRoute);
                },
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

            // Return a promise to a server whose initialization will error
            async function serverInitializationError(): Promise<Server> {
                const initErrorPlugin: Plugin<void> = {
                    name: 'initErrorPlugin',
                    register: () => {
                        throw new Error('mock-init-error')
                    },
                };

                try {
                    await spec.server.register(initErrorPlugin);
                } catch (err) {
                    expect(err).toEqual(new Error('mock-init-error'));
                    throw err;
                }
                return spec.server;
            }

            spec.serverToWrap = serverInitializationError();

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
                spec.mockRoute.handler = (request) => {
                    return { query: request.query }
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
                    spec.event.multiValueQueryStringParameters = {
                        key1: [
                            'value1',
                        ],
                        key2: [
                            'value2',
                            'value3',
                        ],
                    };

                    await spec.injectLambda();
                    expect(spec.handlerRes.statusCode).toBe(200);
                    expect(spec.handlerResBody).toEqual({
                        query: {
                            key1: 'value1',
                            key2: [
                                'value2',
                                'value3',
                            ],
                        },
                    });
                });
            });
        });

        describe('request headers', () => {
            beforeEach(() => {
                spec.event.headers['accept-encoding'] = 'gzip';
                spec.event.multiValueHeaders['accept-encoding'] = [
                    'gzip',
                ];

                spec.mockRoute.handler = (request) => {
                    return { headers: request.headers }
                };
                spec.server.route(spec.mockRoute);
            });

            it('should support multi var headers', async () => {
                spec.event.multiValueHeaders['x-multi-value'] = [
                    'value1',
                    'value2',
                ];
                await spec.injectLambda();
                expect(spec.handlerResBody).toEqual({
                    headers: {
                        'mock-header': 'mock-value',
                        'user-agent': 'mock-user-agent',
                        host: 'mock-host',
                        'x-multi-value': [
                            'value1',
                            'value2',
                        ],
                    },
                });
            });

            it('should remove the accept-encoding header from the request', async () => {
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

            it('should NOT fail when given headers=null', async () => {
                spec.event.headers = null;
                spec.event.multiValueQueryStringParameters = null;

                await spec.injectLambda();
                expect(spec.handlerRes.statusCode).toBe(200);
                expect(spec.handlerRes.headers).toBeUndefined();
                expect(spec.handlerRes.multiValueHeaders).toEqual({
                    'content-type': [
                        'application/json; charset=utf-8',
                    ],
                    'cache-control': [
                        'no-cache',
                    ],
                    'content-length': [
                        90,
                    ],
                    date: [
                        jasmine.any(String) as any,
                    ],
                    connection: [
                        'keep-alive',
                    ],
                    'accept-ranges': [
                        'bytes',
                    ],
                });
                expect(spec.handlerResBody).toEqual({
                    headers: {
                        'mock-header': 'mock-value',
                        'user-agent': 'mock-user-agent',
                        host: 'mock-host',
                    },
                })
            });
        });

        describe('response headers', () => {
            it('should remove the transfer-encoding header from the response', async () => {
                spec.mockRoute.handler = (_request, h) => {
                    return h.response({ status: 'ok' })
                        // explicitly add the header
                        .header('transfer-encoding', 'chunked')
                        // add another header just for the sake of it
                        .header('mock-response-header', 'value');
                };
                spec.server.route(spec.mockRoute);

                await spec.injectLambda();
                expect(spec.handlerRes.statusCode).toBe(200);
                expect(spec.handlerRes.headers).toBeUndefined();
                expect(spec.handlerRes.multiValueHeaders).toEqual({
                    'content-type': [
                        'application/json; charset=utf-8',
                    ],
                    'cache-control': [
                        'no-cache',
                    ],
                    'content-length': [
                        15,
                    ],
                    date: [
                        jasmine.any(String) as any,
                    ],
                    connection: [
                        'keep-alive',
                    ],
                    'mock-response-header': [
                        'value',
                    ],
                    'accept-ranges': [
                        'bytes',
                    ],
                });
                expect(spec.handlerResBody).toEqual({ status: 'ok' })
            });

            it('should hander ')
        });

        describe('request tail', () => {
            it('should wait for request tail before returning', (done) => {
                let lambdaReturned: boolean = false;

                spec.mockRoute.handler = (request: IRequestWithTailPromises) => {
                    if (!request.app.tailPromises) request.app.tailPromises = [];
                    request.app.tailPromises.push(new Promise<void>((resolve) => {
                        setTimeout(() => {
                            if (lambdaReturned) {
                                done.fail('Lambda returned before tail has finished');
                            } else {
                                resolve();
                            }
                            // A second should be enough for the lambda to return if
                            // it didn't wait for the tail
                        }, 1000);
                    }));
                    return {};
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
                spec.mockRoute.handler = (request) => {
                    return { credentials: request.auth.credentials };
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

                    request.credentials = {
                        user: 'mock-user',
                    }
                };

                await spec.injectLambda();
                expect(spec.handlerRes.statusCode).toBe(200);
                expect(spec.handlerResBody).toEqual({
                    credentials: {
                        user: 'mock-user',
                    },
                })
            });
        });

        it('should warn of compression is not disabled on the server', async () => {
            const warnSpy = spyOn(console, 'warn');

            spec.server = new Server({
                compression: {
                    // use minBytes so we can see that it sets the vary header to accept-encoding
                    // which is not needed here since we never return gzipped responses
                    // if gzip is added, it's added by APIGateway later
                    minBytes: 1,
                },
            });
            spec.server.route(spec.mockRoute);
            spec.serverToWrap = spec.server;

            spec.event.headers = null;

            await spec.injectLambda();
            expect(spec.handlerRes.statusCode).toBe(200);
            expect(spec.handlerRes.headers).toBeUndefined();
            expect(spec.handlerRes.multiValueHeaders).toEqual({
                'content-type': [
                    'application/json; charset=utf-8',
                ],
                'cache-control': [
                    'no-cache',
                ],
                'content-length': [
                    15,
                ],
                date: [
                    jasmine.any(String) as any,
                ],
                connection: [
                    'keep-alive',
                ],
                'accept-ranges': [
                    'bytes',
                ],
                vary: [
                    'accept-encoding',
                ],
            });

            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(warnSpy).toHaveBeenCalledWith(
                'Since AWI gateway does not accept gzipped responses - set compression of the server to false',
            );
        });
    });
});
