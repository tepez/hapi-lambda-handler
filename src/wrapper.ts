import * as AwsLambda from 'aws-lambda'
import * as Debug from 'debug'
import * as Hapi from 'hapi'
import * as _ from 'lodash'
import * as Querystring from 'querystring'
import { IInjectOptions } from './types'


// We use the debug module to determine if we need to print the message, i.e. we check if debug.enable
// but we print using console.log
// Don't remember why, but I think it has to due with how the messages appeared on the CloudWatch logs
const debug = Debug('lambda-wrapper');

const removeHeader = function (headers, headerName) {
    const upperCaseHeader = headerName.toUpperCase();
    const key = _.findKey(headers, (value, key) => key.toUpperCase() === upperCaseHeader);
    if (key) {
        delete headers[key];
    }
};

const injectRequest = function (server: Hapi.Server,
                                options: IInjectOptions,
                                event: AwsLambda.APIGatewayEvent,
                                context: AwsLambda.Context,
                                cb: AwsLambda.Callback) {
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

    const requestOptions: Hapi.InjectedRequestOptions = {
        method: event.httpMethod,
        url: url,
        headers: event.headers,
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

    if (debug.enabled) {
        console.log(`Injecting request:\n${JSON.stringify(requestOptions, null, 2)}`);
    }

    let tailReached = false;

    // As the specs shows us, if there are no errors on the route, the tail will be called
    // before the response
    server.once('tail', () => tailReached = true);

    server.inject(requestOptions).then((res) => {

        // api gateway doesn't support chunked transfer-encoding
        // https://github.com/awslabs/aws-serverless-express/issues/10
        removeHeader(res.headers, 'transfer-encoding');

        const lambdaRes = {
            statusCode: res.statusCode,
            headers: res.headers,
            body: res.payload,
        };

        const respond = () => {
            if (debug.enabled) {
                console.log(`Responding to Lambda with:\n${JSON.stringify(lambdaRes, null, 2)}`);
            }
            cb(null, lambdaRes);
        };

        if (tailReached) {
            respond();
        } else {
            if (debug.enabled) {
                console.log('Response is reading. Waiting for request tail');
            }
            server.once('tail', respond);
        }
    });
};

/**
 * Given an Hapi server, return a AWS Lambda handler function that injects the events to it
 * as if they where regular HTTP requests
 * @param {Promise<Server> | Server} server
 * @param {IInjectOptions} options
 * @returns {Handler}
 */
export function handlerFromServer(server: Promise<Hapi.Server> | Hapi.Server, options?: IInjectOptions): AwsLambda.ProxyHandler {
    let _server;

    options = options || {};

    if (server instanceof Hapi.Server) {
        _server = server;
    } else {
        server.then((server) => {
            _server = server;
        })
    }

    return function (event, context, cb) {
        if (server instanceof Hapi.Server) {
            injectRequest(_server, options, event, context, cb);
        } else {
            server.then(
                () => {
                    injectRequest(_server, options, event, context, cb)
                },
                (_ignore) => {
                    // ignoring the error, it's the responsibility of the parent app to capture init errors
                    cb(null, {
                        statusCode: 500,
                        body: JSON.stringify({
                            statusCode: 500,
                            error: 'Internal Server Error',
                            message: 'An internal server error occurred (Server initialization error)',
                        }),
                    });
                },
            );
        }
    };
}
