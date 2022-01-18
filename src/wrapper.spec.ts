import { Plugin, Server } from '@hapi/hapi'
import { IRequestWithTailPromises } from './index'
import { initWrapperSpec, injectLambda, wrapperSpec } from './spec/wrapperSpec';


describe('.handlerFromServer()', () => {
    initWrapperSpec();

    describe('when given a promise to a server', () => {
        it('should inject when ready', (done) => {
            const okInitPlugin: Plugin<void> = {
                name: 'okInitPlugin',
                register: () => {
                    wrapperSpec.server.route(wrapperSpec.mockRoute);
                },
            };

            wrapperSpec.serverToWrap = wrapperSpec.server.register(okInitPlugin)
                .then(() => wrapperSpec.server)
                .catch((err) => {
                    done.fail(err);
                    return Promise.reject(err);
                });

            injectLambda().then(() => {
                expect(wrapperSpec.handlerRes.statusCode).toBe(200);
                expect(wrapperSpec.handlerResBody).toEqual({
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
                    await wrapperSpec.server.register(initErrorPlugin);
                } catch (err) {
                    expect(err).toEqual(new Error('mock-init-error'));
                    throw err;
                }
                return wrapperSpec.server;
            }

            wrapperSpec.serverToWrap = serverInitializationError();

            await injectLambda();
            expect(wrapperSpec.handlerRes.statusCode).toBe(500);
            expect(wrapperSpec.handlerResBody).toEqual({
                statusCode: 500,
                error: 'Internal Server Error',
                message: 'An internal server error occurred (Server initialization error)',
            });
        });
    });

    describe('when given a server', () => {
        describe('query string parameters', () => {
            beforeEach(() => {
                wrapperSpec.mockRoute.handler = (request) => {
                    return { query: request.query }
                };
                wrapperSpec.server.route(wrapperSpec.mockRoute);
            });

            describe('when there are no query string parameters', () => {
                it('should pass empty query to hapi', async () => {
                    await injectLambda();
                    expect(wrapperSpec.handlerRes.statusCode).toBe(200);
                    expect(wrapperSpec.handlerResBody).toEqual({
                        query: {},
                    });
                });
            });

            describe('when there are query string parameters', () => {
                it('should pass them to hapi', async () => {
                    wrapperSpec.event.queryStringParameters = {
                        key1: 'value1',
                        key2: 'value2',
                    };
                    wrapperSpec.event.multiValueQueryStringParameters = {
                        key1: [
                            'value1',
                        ],
                        key2: [
                            'value2',
                            'value3',
                        ],
                    };

                    await injectLambda();
                    expect(wrapperSpec.handlerRes.statusCode).toBe(200);
                    expect(wrapperSpec.handlerResBody).toEqual({
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
                wrapperSpec.event.headers['accept-encoding'] = 'gzip';
                wrapperSpec.event.multiValueHeaders['accept-encoding'] = [
                    'gzip',
                ];

                wrapperSpec.mockRoute.handler = (request) => {
                    return { headers: request.headers }
                };
                wrapperSpec.server.route(wrapperSpec.mockRoute);
            });

            it('should support multi var headers', async () => {
                wrapperSpec.event.multiValueHeaders['x-multi-value'] = [
                    'value1',
                    'value2',
                ];
                await injectLambda();
                expect(wrapperSpec.handlerResBody).toEqual({
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
                await injectLambda();
                expect(wrapperSpec.handlerRes.statusCode).toBe(200);
                expect(wrapperSpec.handlerResBody).toEqual({
                    headers: {
                        'mock-header': 'mock-value',
                        'user-agent': 'mock-user-agent',
                        host: 'mock-host',
                    },
                });
            });

            it('should remove the accept-encoding header from the request, even when upper cased', async () => {
                wrapperSpec.event.headers['Accept-Encoding'] = 'gzip';
                wrapperSpec.event.multiValueHeaders['Accept-Encoding'] = [
                    'gzip',
                ];

                await injectLambda();
                expect(wrapperSpec.handlerRes.statusCode).toBe(200);
                expect(wrapperSpec.handlerResBody).toEqual({
                    headers: {
                        'mock-header': 'mock-value',
                        'user-agent': 'mock-user-agent',
                        host: 'mock-host',
                    },
                });
            });

            it('should NOT fail when given headers=null', async () => {
                wrapperSpec.event.headers = null;
                wrapperSpec.event.multiValueQueryStringParameters = null;

                await injectLambda();
                expect(wrapperSpec.handlerRes.statusCode).toBe(200);
                expect(wrapperSpec.handlerRes.headers).toBeUndefined();
                expect(wrapperSpec.handlerRes.multiValueHeaders).toEqual({
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
                expect(wrapperSpec.handlerResBody).toEqual({
                    headers: {
                        'mock-header': 'mock-value',
                        'user-agent': 'mock-user-agent',
                        host: 'mock-host',
                    },
                })
            });
        });

        describe('client ip', () => {
            beforeEach(() => {
                wrapperSpec.mockRoute.handler = (request) => {
                    return { remoteAddress: request.info.remoteAddress }
                };
                wrapperSpec.server.route(wrapperSpec.mockRoute);
            });

            it('should default to 127.0.0.1', async () => {
                await injectLambda();
                expect(wrapperSpec.handlerResBody).toEqual({
                    remoteAddress: '127.0.0.1',
                });
            });

            it('should get IP address from x-forwarded-for header', async () => {
                wrapperSpec.event.multiValueHeaders['x-forwarded-for'] = [
                    '85.250.108.184, 130.176.1.95, 130.176.1.72',
                ];
                await injectLambda();
                expect(wrapperSpec.handlerResBody).toEqual({
                    remoteAddress: '85.250.108.184',
                });
            });

            it('should get IP address from x-forwarded-for header, even whe upper cased', async () => {
                wrapperSpec.event.multiValueHeaders['X-Forwarded-For'] = [
                    '85.250.108.184, 130.176.1.95, 130.176.1.72',
                ];
                await injectLambda();
                expect(wrapperSpec.handlerResBody).toEqual({
                    remoteAddress: '85.250.108.184',
                });
            });
        });

        describe('response headers', () => {
            it('should remove the transfer-encoding header from the response', async () => {
                wrapperSpec.mockRoute.handler = (_request, h) => {
                    return h.response({ status: 'ok' })
                        // explicitly add the header
                        .header('transfer-encoding', 'chunked')
                        // add another header just for the sake of it
                        .header('mock-response-header', 'value');
                };
                wrapperSpec.server.route(wrapperSpec.mockRoute);

                await injectLambda();
                expect(wrapperSpec.handlerRes.statusCode).toBe(200);
                expect(wrapperSpec.handlerRes.headers).toBeUndefined();
                expect(wrapperSpec.handlerRes.multiValueHeaders).toEqual({
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
                expect(wrapperSpec.handlerResBody).toEqual({ status: 'ok' })
            });
        });

        describe('request tail', () => {
            it('should wait for request tail before returning', (done) => {
                let lambdaReturned: boolean = false;

                wrapperSpec.mockRoute.handler = (request: IRequestWithTailPromises) => {
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
                wrapperSpec.server.route(wrapperSpec.mockRoute);

                injectLambda().then(() => {
                    lambdaReturned = true;
                    expect(wrapperSpec.handlerRes.statusCode).toBe(200);
                    expect(wrapperSpec.handlerResBody).toEqual({})
                }).then(done, done.fail);
            });
        });

        describe('basePath', () => {
            beforeEach(() => {
                wrapperSpec.server.route(wrapperSpec.mockRoute);
                wrapperSpec.event.path = `/mock-base-path${wrapperSpec.event.path}`;
            });

            it('should strip basePath from the event URL', async () => {
                wrapperSpec.injectOptions.basePath = '/mock-base-path';

                await injectLambda();
                expect(wrapperSpec.handlerRes.statusCode).toBe(200);
                expect(wrapperSpec.handlerResBody).toEqual({
                    status: 'ok',
                })
            });

            it(`should return 404 if we don't provide the basePath`, async () => {
                await injectLambda();
                expect(wrapperSpec.handlerRes.statusCode).toBe(404);
                expect(wrapperSpec.handlerResBody).toEqual({
                    statusCode: 404,
                    error: 'Not Found',
                    message: 'Not Found',
                })
            });
        });

        describe('setRequestId function', () => {
            beforeEach(() => {
                wrapperSpec.mockRoute.handler = (request) => {
                    return { id: request.info.id };
                };
                wrapperSpec.server.route(wrapperSpec.mockRoute);
            });

            const testSetRequestId = (): void => {
                it('should set request.id', async () => {
                    await injectLambda();
                    expect(wrapperSpec.handlerRes.statusCode).toBe(200);
                    expect(wrapperSpec.handlerResBody).toEqual({
                        id: 'mock-aws-request-id',
                    });
                });
            };

            describe('by default', () => {
                testSetRequestId();
            });

            describe('when setRequestId=tre', () => {
                beforeEach(() => {
                    wrapperSpec.injectOptions.setRequestId = true;
                });

                testSetRequestId();
            });

            describe('when setRequestId=false', () => {
                beforeEach(() => {
                    wrapperSpec.injectOptions.setRequestId = false;
                })

                it('should set NOT set request.id', async () => {
                    await injectLambda();
                    expect(wrapperSpec.handlerRes.statusCode).toBe(200);
                    expect(wrapperSpec.handlerResBody).toEqual({
                        id: jasmine.stringMatching(new RegExp(wrapperSpec.server.info.host)),
                    });
                });
            });
        });

        describe('modifyRequest function', () => {
            it('should call it before injecting the request', async () => {
                wrapperSpec.mockRoute.handler = (request) => {
                    return { credentials: request.auth.credentials };
                };
                wrapperSpec.server.route(wrapperSpec.mockRoute);

                wrapperSpec.injectOptions.modifyRequest = (event, context, request) => {
                    expect(event).toBe(wrapperSpec.event);
                    expect(context).toBe(wrapperSpec.context);
                    expect(request).toEqual({
                        method: 'GET',
                        url: '/health',
                        headers: {
                            'mock-header': 'mock-value',
                            'user-agent': 'mock-user-agent',
                            host: 'mock-host',
                        },
                        plugins: {
                            lambdaRequestId: {
                                requestId: 'mock-aws-request-id',
                            },
                        },
                    });

                    request.auth = {
                        strategy: 'default',
                        credentials: {
                            user: 'mock-user',
                        },
                    }
                };

                await injectLambda();
                expect(wrapperSpec.handlerRes.statusCode).toBe(200);
                expect(wrapperSpec.handlerResBody).toEqual({
                    credentials: {
                        user: 'mock-user',
                    },
                })
            });
        });

        it('should warn of compression is not disabled on the server', async () => {
            const warnSpy = spyOn(console, 'warn');

            wrapperSpec.server = new Server({
                compression: {
                    // use minBytes so we can see that it sets the vary header to accept-encoding
                    // which is not needed here since we never return gzipped responses
                    // if gzip is added, it's added by APIGateway later
                    minBytes: 1,
                },
            });
            wrapperSpec.server.route(wrapperSpec.mockRoute);
            wrapperSpec.serverToWrap = wrapperSpec.server;

            wrapperSpec.event.headers = null;

            await injectLambda();
            expect(wrapperSpec.handlerRes.statusCode).toBe(200);
            expect(wrapperSpec.handlerRes.headers).toBeUndefined();
            expect(wrapperSpec.handlerRes.multiValueHeaders).toEqual({
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
