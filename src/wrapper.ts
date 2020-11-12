import { assignSame } from '@tepez/ts-utils'
import { APIGatewayEvent, APIGatewayProxyResult, Context } from 'aws-lambda'
import * as Debug from 'debug'
import { Server } from 'hapi'
import { AsyncHandler, IInjectOptions, IRequestWithTailPromises } from './types'
import { eventToHapiRequest, hapiResponseToResult, isPromise } from './utils';


// We use the debug module to determine if we need to print the message, i.e. we check if debug.enable
// but we print using console.log
// Don't remember why, but I think it has to due with how the messages appeared on the CloudWatch logs
const debug = Debug('lambda-wrapper');

async function injectRequest(
    server: Server,
    options: IInjectOptions,
    event: APIGatewayEvent,
    context: Context,
): Promise<APIGatewayProxyResult> {
    if (debug.enabled) {
        console.log('Received Lambda request');
        console.log('Event:');
        console.log(JSON.stringify(event, null, 2));
        console.log('Context:');
        console.log(JSON.stringify(context, null, 2));
    }

    const requestOptions = eventToHapiRequest(event, options.basePath);

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

    const lambdaRes = hapiResponseToResult(res);

    debug('Responding to Lambda with\n%j', lambdaRes);

    return lambdaRes;
}


/**
 * Given an Hapi server, return a AWS Lambda handler function that injects the events to it
 * as if they where regular HTTP requests
 * @param {Promise<Server> | Server} server
 * @param {IInjectOptions} options
 * @returns {AsyncHandler}
 */
export function handlerFromServer(server: Promise<Server> | Server, options?: IInjectOptions): AsyncHandler {
    let _server: Server;
    const _options = assignSame<IInjectOptions>({}, options)

    let serverChecked: boolean;

    const checkServerConfig = (server: Server): void => {
        if (serverChecked) return;
        if (server.settings.compression !== false) {
            console.warn(`Since AWI gateway does not accept gzipped responses - set compression of the server to false`);
        }
        serverChecked = true;
    };


    if (isPromise(server)) {
        server = server.then((resolvedServer) => {
            _server = resolvedServer;
            checkServerConfig(_server);
            return _server;
        })
    } else {
        _server = server;
        checkServerConfig(_server);
    }

    return async function (event, context) {
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

        return await injectRequest(_server, _options, event, context);
    };
}
