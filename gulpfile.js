'use strict';
const Gulp = require('gulp');
const TypescriptBuildGulpTasks = require('@tepez/typescript-build-gulp-tasks');

TypescriptBuildGulpTasks.register(Gulp);

Gulp.task('default', ['dev-unit-test']);