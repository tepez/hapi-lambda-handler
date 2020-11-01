import filterConsole = require('filter-console');
import HookStd = require('hook-std');
import { Unhook } from 'hook-std';


export let stdout: string
export let stderr: string

export function initStdoutSpec(): void {
    let disableFilter: () => void;
    let unhookStdout: Unhook;
    let unhookStderr: Unhook;

    // beforeAll instead of beforeEach because we don't want to interfere with the stdhooks set in
    // the lambda handler
    // if we remove them between specs that we'd go back to the normal stdout and stderr
    beforeAll(() => {
        disableFilter = filterConsole(['DeprecationWarning']);

        const { unhook: _unhookStdout } = HookStd.stdout({ silent: false }, (str) => {
            stdout += str;
            return str;
        });
        unhookStdout = _unhookStdout;

        const { unhook: _unhookStderr } = HookStd.stderr({ silent: false }, (str) => {
            stderr += str;
            return str;
        });
        unhookStderr = _unhookStderr;
    });

    beforeEach(() => {
        stdout = '';
        stderr = '';
    });

    afterAll(() => {
        disableFilter();
        unhookStdout();
        unhookStderr();
    })
}