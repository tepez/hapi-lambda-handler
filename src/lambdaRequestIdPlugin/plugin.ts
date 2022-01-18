import { Plugin, Server } from '@hapi/hapi';
import { ILambdaRequestPluginData } from './types';

/**
 * A plugin for setting the request ID of hapi requests to be the same requst id as the lambda request
 */
export const lambdaRequestIdPlugin: Plugin<void> = {
    name: 'lambdaRequestId',
    register: async (server: Server) => {
        server.ext('onPreAuth', (req, h) => {
            const reqId = (req.plugins as ILambdaRequestPluginData).lambdaRequestId?.requestId;
            if (reqId) {
                // It seems we can just override it
                // https://github.com/hapijs/hapi/issues/2793#issuecomment-145143364
                req.info.id = reqId;
            }
            return h.continue;
        })
    },
};