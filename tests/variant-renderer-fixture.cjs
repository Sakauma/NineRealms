/* Dependency-free SVG facade. This does not execute a browser or certify pixels. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Engine = require('../src/engine.js');
class SvgNode {
  constructor(tag) {
    this.tag = tag;
    this.attrs = {};
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.textContent = '';
    this.parentNode = null;
    this.replacements = 0;
  }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  appendChild(node) { this.children.push(node); node.parentNode = this; return node; }
  replaceChildren(...children) {
    this.children.forEach(node => { node.parentNode = null; });
    this.children = [];
    children.forEach(node => this.appendChild(node));
    this.replacements++;
  }
}
function createRenderer() {
  const env = {SudokuEngine:Engine, document:{createElementNS:(namespace, tag)=>new SvgNode(tag)}};
  vm.createContext(env);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/variant-view.js'), 'utf8'), env);
  return env.SudokuVariantView;
}
const clone = value => JSON.parse(JSON.stringify(value));
function descendants(node) { return node.children.flatMap(child => [child, ...descendants(child)]); }
function layer(svg, name) { return svg.children.find(node=>node.attrs['data-layer']===name); }
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}
function semanticSeeds() {
  // Classic has thousands of symbol permutations with the same empty clue document.
  // Every published nonclassic clue document, including all fusion puzzles, is retained.
  let sawClassic = false;
  return Engine.getSeedPuzzles().filter(puzzle => {
    if (puzzle.mode !== 'classic') return true;
    if (sawClassic) return false;
    sawClassic = true;
    return true;
  });
}
// Only local identifier spelling is normalized; all geometry, paint, metadata,
// labels and child order are retained for exact render regression comparisons.
function normalizedTree(root) {
  const ids = new Map(descendants(root).filter(node=>node.attrs.id).map((node,index)=>[node.attrs.id,'paint-'+index]));
  const visit = node => ({tag:node.tag, attrs:Object.fromEntries(Object.entries(node.attrs).map(([key,value])=>
    [key,key==='data-variant-materials'?'local-material-scope':key==='id'?ids.get(value):value.replace(/url\(#([^)]*)\)/g,
      (whole,id)=>ids.has(id)?'url(#'+ids.get(id)+')':whole)])),text:node.textContent,children:node.children.map(visit)});
  return visit(root);
}
module.exports = {SvgNode, createRenderer, descendants, layer, clone, freeze, semanticSeeds, normalizedTree};
