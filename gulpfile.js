const gulp = require("gulp");
const del = require("del");
const sass = require("sass");
const fs = require("fs");
const path = require("path");
const rename = require("gulp-rename");
const transform = require("gulp-transform");
const {buildContent, getTagMetadata} = require("./src/content");
const Viz = require('viz.js');
const vizRenderOpts = require('viz.js/full.render.js');

const {paths} = require("./build-config.json");
const runServer = require("./server");

//the dist directory may contain outdated content, so start clean
function clean() {
  return del(paths.dist);
}

//build the stylesheet from SASS
function assetStyles() {
  return new Promise((resolve, reject) => {
    sass.render({file: paths.srcStyleEntry}, (err, res) => {
      if (err) {
        reject(err);
      } else {
        fs.mkdirSync(paths.distAssets, {recursive: true});
        fs.writeFileSync(path.join(paths.distAssets, "style.css"), res.css, "utf8");
        resolve();
      }
    });
  });
}

//copies any static image assets over to the dist directory
function assetImages() {
  return gulp.src(paths.srcAssetImages)
    .pipe(gulp.dest(paths.dist));
}

//any assets which come from our dependencies can be copied over too
function vendorAssets() {
  return gulp.src(paths.vendorAssets)
    .pipe(gulp.dest(paths.distAssets));
}

//special diagram built from invader tag definitions
async function tagsDiagram() {
  const normalize = (s) => s.toLowerCase().replace(/[^a-z]/g, "");
  const structs = Object.values(await getTagMetadata(paths.invaderTagDefsBase));
  const edges = structs.flatMap(struct => {
    const structEdges = [];
    if (struct.fields) {
      struct.fields.forEach(field => {
        if (field.type == "TagReflexive") {
          structEdges.push(`${normalize(struct.name)} -> ${normalize(field.struct)};`);
        } else if (field.type == "TagDependency") {
          field.classes.forEach(clazz => {
            if (clazz != "*") {
              structEdges.push(`${normalize(struct.name)} -> ${normalize(clazz)};`);
            }
          });
        }
      });
    }
    if (struct.inherits) {
      structEdges.push(`${normalize(struct.name)} -> ${normalize(struct.inherits)} [label="Inherits"];`);
    }
    return structEdges;
  }).join("\n");
  const graphvizSrc = `digraph {\n${edges}\n}`;
  const viz = new Viz(vizRenderOpts);
  const svg = await viz.renderString(graphvizSrc);
  fs.mkdirSync("./dist/blam/tags/", {recursive: true});
  fs.writeFileSync(path.join("./dist/blam/tags/", "tags.svg"), svg, "utf8");
}

//build content graphviz diagrams into SVG (https://graphviz.org)
function contentDiagrams() {
  return gulp.src(paths.srcDiagrams)
    .pipe(transform("utf8", (graphvizSrc) => {
      const viz = new Viz(vizRenderOpts);
      return viz.renderString(graphvizSrc);
    }))
    .pipe(rename({extname: ".svg"}))
    .pipe(gulp.dest(paths.dist));
}

//content file types which we wish to copy over to dist
function contentResources() {
  return gulp.src(paths.srcResources)
    .pipe(gulp.dest(paths.dist));
}

//index and render all readme.md files to HTML
async function contentPages() {
  await buildContent(paths.srcContentBase, paths.dist, paths.invaderTagDefsBase);
}

function watchSources() {
  gulp.watch([paths.srcAssetImages], assetImages);
  gulp.watch([paths.srcStylesAny], assetStyles);
  gulp.watch([paths.srcPages], contentPages);
  gulp.watch([paths.srcResources], contentResources);
  gulp.watch([paths.srcDiagrams], contentDiagrams);
  runServer();
}

//composite tasks
const assets = gulp.parallel(assetImages, assetStyles, vendorAssets);
const content = gulp.parallel(contentResources, contentPages, contentDiagrams);
const buildAll = gulp.series(clean, gulp.parallel(assets, content));
const dev = gulp.series(buildAll, watchSources);

//tasks which can be invoked from CLI with `npx gulp <taskname>`
module.exports = {
  clean, //remove the dist directory
  assets, //build just styles
  content, //build just page content
  dev, //local development mode
  tagsDiagram,
  default: buildAll //typical build for publishing content
};
