import HookStd = require('hook-std');


let prefix: string = null;
let hookSet = false;

const transform: HookStd.Transform = (output: string): string => {
    return prefix
        ? `${prefix} ${output}`
        : output;
}

export function setStdoutPrefix(newPrefix: string): void {
    if (!hookSet) {
        HookStd.stdout({ silent: false }, transform);
        HookStd.stderr({ silent: false }, transform);
        hookSet = true;
    }

    prefix = newPrefix;
}