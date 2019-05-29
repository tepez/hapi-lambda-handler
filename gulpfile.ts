import * as Gulp from 'gulp'
import * as TypescriptBuildGulpTasks from '@tepez/typescript-build-gulp-tasks'


TypescriptBuildGulpTasks.register(Gulp);

Gulp.task('default', TypescriptBuildGulpTasks.tasks.devUnitTest);