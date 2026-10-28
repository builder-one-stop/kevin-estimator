// @vitest-environment jsdom
import React from 'react'
import {it,expect,vi,afterEach} from 'vitest'
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react'
import MaterialReferencePicker from '../../src/components/ai/MaterialReferencePicker.jsx'
vi.mock('../../src/services/ai.js',()=>({aiRequest:vi.fn()}))
import {aiRequest} from '../../src/services/ai.js'
const row=i=>({id:'id-'+i,category:'paint',product:'Own finish paint '+i,sku:'OWN-'+i,package:'1 US gal',vendor:'Own quote'})
afterEach(()=>{cleanup();vi.resetAllMocks()})
it('loads later role-filtered pages, deduplicates overlaps and resets pagination for a server search',async()=>{
 aiRequest.mockImplementation(async p=>{const q=new URL('http://local/'+p).searchParams;if(q.get('q'))return {rows:[row(45)],nextOffset:null};return q.get('offset')==='0'?{rows:Array.from({length:40},(_,i)=>row(i+1)),nextOffset:40}:{rows:[row(40),...Array.from({length:5},(_,i)=>row(i+41))],nextOffset:null}})
 const change=vi.fn();render(<MaterialReferencePicker role="paint" label="Saved" value="" language="en" onChange={change}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'Load more references (paint)'}).disabled).toBe(false));fireEvent.click(screen.getByRole('button',{name:'Load more references (paint)'}));await waitFor(()=>expect(screen.getByLabelText('Choose exact reference (paint)').options).toHaveLength(46))
 fireEvent.change(screen.getByLabelText('Choose exact reference (paint)'),{target:{value:'id-45'}});expect(change).toHaveBeenCalledWith('id-45')
 fireEvent.change(screen.getByLabelText('Search references (paint)'),{target:{value:'OWN-45'}});await waitFor(()=>expect(screen.getByLabelText('Choose exact reference (paint)').options).toHaveLength(2));expect(aiRequest.mock.calls.at(-1)[0]).toContain('offset=0&q=OWN-45');expect(screen.queryByRole('button',{name:'Load more references (paint)'})).toBeNull()
})
it('cancels stale searches, ignores late responses and preserves the saved selection on errors',async()=>{
 const pending=[];aiRequest.mockImplementation((p,b,m,bin,options)=>new Promise((resolve,reject)=>pending.push({p,options,resolve,reject})))
 const view=render(<MaterialReferencePicker role="paint" value="saved" label="Original snapshot" language="en" onChange={()=>{}}/>);
 await waitFor(()=>expect(pending).toHaveLength(1));fireEvent.change(screen.getByLabelText('Search references (paint)'),{target:{value:'OWN-45'}});expect(pending[0].options.signal.aborted).toBe(true);await waitFor(()=>expect(pending).toHaveLength(2));pending[1].resolve({rows:[row(45)],nextOffset:null});await screen.findByRole('option',{name:/OWN-45/});pending[0].resolve({rows:[row(1)],nextOffset:null});await waitFor(()=>expect(screen.queryByRole('option',{name:/OWN-1$/})).toBeNull())
 fireEvent.change(screen.getByLabelText('Search references (paint)'),{target:{value:'broken'}});await waitFor(()=>expect(pending).toHaveLength(3));pending[2].reject(Error('offline'));await screen.findByText(/Catalog unavailable/);expect(screen.getByLabelText('Choose exact reference (paint)').value).toBe('saved');view.unmount();expect(pending[2].options.signal.aborted).toBe(true)
})
it.each(['en','es'])('shows empty results without losing a pending plan in %s',async language=>{
 aiRequest.mockResolvedValue({rows:[],nextOffset:null});render(<MaterialReferencePicker role="primer" label="Pending" value="" language={language} onChange={()=>{}}/>);await screen.findByText(language==='es'?'Sin referencias coincidentes. Mantén pendiente o cambia la búsqueda.':'No matching references. Keep pending or change the search.')
})
