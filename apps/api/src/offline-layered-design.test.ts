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
 it('preserves the original unlocalized digest and makes locale a distinct immutable source',()=>{
  const legacy=render({format:'SQUARE',title:'A',body:'B',accent:'#124d83'});
  expect(legacy.spec).toEqual({format:'SQUARE',title:'A',body:'B',accent:'#124d83'});
  const previous='<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">'+
   '<g id="background"><rect width="1080" height="1080" fill="#ffffff"/></g>'+
   '<g id="accent"><rect x="0" y="0" width="1080" height="36" fill="#124d83"/><rect x="88" y="112" width="112" height="10" rx="5" fill="#124d83"/></g>'+
   '<g id="headline" font-family="sans-serif" font-size="56" font-weight="700" fill="#142c47"><text x="88" y="220">A</text></g>'+
   '<g id="body-copy" font-family="sans-serif" font-size="30" fill="#334155"><text x="88" y="310">B</text></g>'+
   '<g id="draft-mark"><text x="88" y="1028" font-family="sans-serif" font-size="19" fill="#64748b">Internal editable draft · not approved for release</text></g></svg>';
  expect(legacy.svg).toBe(previous);
  const arabic={...input,title:'البحث والابتكار',body:'مسودة للمراجعة العلمية & الترجمة',locale:'ar-EG'};
  const ar=render(arabic),fr=render({...input,locale:'fr-MA'});
  expect(ar.spec.locale).toBe('ar-EG');
  expect(ar.svg).toContain('xml:lang="ar-EG"');expect(ar.svg).toContain('x="992" y="220" direction="rtl"');
  expect(ar.svg).toContain('البحث والابتكار');expect(ar.svg).toContain('&amp;');
  expect(fr.svg).toContain('xml:lang="fr-MA"');expect(fr.svg).toContain('x="88" y="220" direction="ltr"');
  expect(render(arabic)).toEqual(ar);expect(render({...arabic,locale:'ar-SA'}).sourceDigest).not.toBe(ar.sourceDigest);
  for(const locale of ['xx-XX','ar-EG" onload="bad',null])expect(()=>render({...input,locale})).toThrow();
  expect(()=>render({...arabic,title:'A\u202eB'})).toThrow('bidirectional');
 });
 it('rejects external references, executable payload fields, invalid layout and unbounded text',()=>{
  for(const value of [{...input,svg:'<svg/>'},{...input,href:'https://example.org'},
   {...input,accent:'url(https://example.org)'},{...input,format:'VIDEO'},
   {...input,title:'x'.repeat(91)},{...input,body:'x'.repeat(401)},{...input,body:'a\u0000b'}])
   expect(()=>render(value)).toThrow();
 });
});
