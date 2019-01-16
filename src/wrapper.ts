import { APIGatewayEvent, APIGatewayProxyHandler, APIGatewayProxyResult, Context } from 'aws-lambda'
import * as Debug from 'debug'
import * as Hapi from 'hapi'
import { Server, ServerInjectOptions } from 'hapi'
import * as _ from 'lodash'
import * as Querystring from 'querystring'
import { Headers } from 'shot'
import { IInjectOptions, IRequestWithTailPromises } from './types'


// We use the debug module to determine if we need to print the message, i.e. we check if debug.enable
// but we print using console.log
// Don't remember why, but I think it has to due with how the messages appeared on the CloudWatch logs
const debug = Debug('lambda-wrapper');

function removeHeader(headers: Headers, headerName: string): void {
    const upperCaseHeader = headerName.toUpperCase();
    const key = _.findKey(headers, (value, key) => key.toUpperCase() === upperCaseHeader);
    if (key) {
        delete headers[key];
    }
}

async function injectRequest(server: Server,
                             options: IInjectOptions,
                             event: APIGatewayEvent,
                             context: Context): Promise<APIGatewayProxyResult> {
    if (debug.enabled) {
        console.log('Received Lambda request');
        console.log('Event:');
        console.log(JSON.stringify(event, null, 2));
        console.log('Context:');
        console.log(JSON.stringify(context, null, 2));
    }

    let url = event.path;

    // when accessing the route using a custom domain, we need to ignore the base path,
    // e.g. '/dev-docs-sets/docsSet' => '/docsSet'
    // when accessing the route using the lambda endpoint, we don't need to remove the base path
    if (options.basePath && url.indexOf(options.basePath) === 0) {
        url = url.substr(options.basePath.length);
    }

    const requestOptions: ServerInjectOptions = {
        method: event.httpMethod,
        url: url,
        headers: event.headers || {},
    };

    const qs = Querystring.stringify(event.queryStringParameters);
    if (qs) {
        requestOptions.url += `?${qs}`;
    }

    // we can't return gzipped content, this seems to be the way to disable it in Hapi
    // https://github.com/hapijs/hapi/issues/2449
    removeHeader(requestOptions.headers, 'accept-encoding');

    if (event.body) {
        requestOptions.payload = event.body;
    }

    if (options.modifyRequest) {
        options.modifyRequest(event, context, requestOptions);
    }

    debug('Injecting request:\n%j', requestOptions);

    const res = await server.inject(requestOptions);

    const req = res.request as IRequestWithTailPromises;
    if (req.app.tailPromises && req.app.tailPromises.length > 0) {
        debug('Waiting for %d tail promises', req.app.tailPromises.length);
        await Promise.all(req.app.tailPromises);
    }

    // api gateway doesn't support chunked transfer-encoding
    // https://github.com/awslabs/aws-serverless-express/issues/10
    removeHeader(res.headers, 'transfer-encoding');

    const lambdaRes: APIGatewayProxyResult = {
        statusCode: res.statusCode,
        headers: res.headers as any, // TODO when can a header value be an array of string?
        body: res.payload,
    };

    debug('Responding to Lambda with\n%j', lambdaRes);

    return lambdaRes;
}

function isPromise<T>(val: any): val is Promise<T> {
    return typeof val.then === 'function'
}

/**
 * Given an Hapi server, return a AWS Lambda handler function that injects the events to it
 * as if they where regular HTTP requests
 * @param {Promise<Server> | Server} server
 * @param {IInjectOptions} options
 * @returns {Handler}
 */
export function handlerFromServer(server: Promise<Server> | Server, options?: IInjectOptions): APIGatewayProxyHandler {
    let _server: Server;

    options = options || {};

    let serverChecked: boolean;

    function checkServerConfig(server: Server) {
        if (serverChecked) return;
        if (server.settings.compression !== false) {
            console.warn(`Since AWI gateway does not accept gzipped responses - set compression of the server to false`);
        }
        serverChecked = true;
    }


    if (isPromise(server)) {
        server.then((resolvedServer) => {
            _server = resolvedServer;
            checkServerConfig(_server);
        })
    } else {
        _server = server;
        checkServerConfig(_server);
    }

    return async function (event, context): Promise<APIGatewayProxyResult> {
        if (!_server) {
            try {
                await server;
            } catch (_ignore) {
                // ignoring the error, it's the responsibility of the parent app to capture init errors
                return {
                    statusCode: 500,
                    body: JSON.stringify({
                        statusCode: 500,
                        error: 'Internal Server Error',
                        message: 'An internal server error occurred (Server initialization error)',
                    }),
                };
            }
        }

        return injectRequest(_server, options, event, context);
    };
}
