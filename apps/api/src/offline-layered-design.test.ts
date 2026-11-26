import {describe,it,expect} from 'vitest';
import {renderOfflineLayeredSpec as render} from './offline-layered-design.js';
const input={format:'SQUARE',title:'Research & innovation',body:'Plain copy <script> is escaped.',accent:'#124D83'};
describe('Deterministic bounded layered source',()=>{
 it('normalizes and renders independent editable layers with stable digests',()=>{
  const a=render(input),b=render({accent:'#124d83',body:input.body,format:input.format,title:input.title});
  expect(a).toEqual(b);expect(a.sourceDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(a.renditionDigest).not.toBe(a.sourceDigest);
  expect(a.svg).toContain('id="headline"');expect(a.svg).toContain('id="body-copy"');
  expect(a.svg).toContain('Research &amp;');expect(a.svg).toContain('&lt;script&gt;');
  expect(a.svg).not.toContain('<script>');
  expect(render({...input,accent:'#abcdef'}).renditionDigest).not.toBe(a.renditionDigest);
 });
 it('rejects external references, executable payload fields, invalid layout and unbounded text',()=>{
  for(const value of [{...input,svg:'<svg/>'},{...input,href:'https://example.org'},
   {...input,accent:'url(https://example.org)'},{...input,format:'VIDEO'},
   {...input,title:'x'.repeat(91)},{...input,body:'x'.repeat(401)},{...input,body:'a\u0000b'}])
   expect(()=>render(value)).toThrow();
 });
});
