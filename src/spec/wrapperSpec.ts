import { Server, ServerRoute } from '@hapi/hapi';
import { APIGatewayEvent, APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { IInjectOptions } from '../types';
import { handlerFromServer } from '../wrapper';

export interface IWrapperSpec {
    event: APIGatewayProxyEvent
    context: Context

    injectOptions: IInjectOptions
    mockRoute: ServerRoute
    server: Server
    serverToWrap: Server | Promise<Server>

    handlerRes: APIGatewayProxyResult
    handlerResBody: any
}

export let wrapperSpec: IWrapperSpec;

export const injectLambda = async (): Promise<void> => {
    const handler = handlerFromServer(wrapperSpec.serverToWrap, wrapperSpec.injectOptions);

    wrapperSpec.handlerRes = await handler(
        wrapperSpec.event as APIGatewayEvent,
        wrapperSpec.context as Context,
    ) as APIGatewayProxyResult;
    if (wrapperSpec.handlerRes.body) {
        wrapperSpec.handlerResBody = JSON.parse(wrapperSpec.handlerRes.body);
    }
};

export function initWrapperSpec(): void {
    afterEach((): void => wrapperSpec = null);

    beforeEach(function () {
        wrapperSpec = {} as IWrapperSpec;

        wrapperSpec.injectOptions = {};
        wrapperSpec.context = {
            awsRequestId: 'mock-aws-request-id',
        } as Context;

        wrapperSpec.event = {
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

        wrapperSpec.mockRoute = {
            method: 'GET',
            path: '/health',
            handler: () => ({ status: 'ok' }),
        };

        wrapperSpec.server = new Server({
            compression: false,
        });

        wrapperSpec.serverToWrap = wrapperSpec.server;
    });
}