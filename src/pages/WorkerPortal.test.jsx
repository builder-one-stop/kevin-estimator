// @vitest-environment jsdom
import {afterEach,beforeEach,it,expect,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor,act} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {I18nextProvider} from 'react-i18next'
import i18n from '../i18n/index.js'
import WorkerPortal from './WorkerPortal.jsx'
const {execute,geo}=vi.hoisted(()=>({execute:vi.fn(),geo:vi.fn()}))
vi.mock('../components/workers/useWorkers.js',()=>({useWorkers:()=>({data:{workers:[{id:'w',name:'QA worker'}],projects:[{id:'p',name:'QA site'}],shifts:[],evidence:[],corrections:[],assignments:[],serverTime:new Date().toISOString()},error:'',busy:false,execute,reload:vi.fn()})}))
vi.mock('../../shared/workerLocation.js',()=>({captureEntryLocation:geo}))
vi.mock('../supabaseClient.js',()=>({supabase:{auth:{signOut:vi.fn()}}}))
beforeEach(async()=>{await i18n.changeLanguage('en');execute.mockReset();geo.mockReset();sessionStorage.clear()})
afterEach(cleanup)
const show=()=>render(<MemoryRouter><I18nextProvider i18n={i18n}><WorkerPortal/></I18nextProvider></MemoryRouter>)
it('explains location, waits for it and confirms only after server persistence; duplicate clicks are locked',async()=>{
 let locate,save;geo.mockImplementation(()=>new Promise(r=>locate=r));execute.mockImplementation(()=>new Promise(r=>save=r));show();expect(screen.getByText(/shared with your administrator/)).toBeTruthy();const button=screen.getByRole('button',{name:'Clock in',exact:true});fireEvent.click(button);fireEvent.click(button);expect(geo).toHaveBeenCalledTimes(1);expect(screen.getByRole('status').textContent).toContain('Getting location');expect(execute).not.toHaveBeenCalled();
 const location={latitude:34,longitude:-118,accuracy:500,capturedAt:new Date().toISOString()};await act(()=>locate(location));expect(execute).toHaveBeenCalledTimes(1);expect(execute.mock.calls[0][1].location).toEqual(location);expect(screen.queryByText(/Clock-in saved/)).toBeNull();await act(()=>save({id:'shift'}));expect(screen.getByRole('status').textContent).toContain('Clock-in saved')
})
it('denied permission makes no clock request and offers enable/retry instructions in EN/ES',async()=>{
 geo.mockRejectedValue(new Error('GEO_DENIED'));show();fireEvent.click(screen.getByRole('button',{name:'Clock in',exact:true}));await screen.findByRole('alert');expect(execute).not.toHaveBeenCalled();expect(screen.getByText(/Enable location for this site/)).toBeTruthy();await act(()=>i18n.changeLanguage('es'));expect(screen.getByRole('alert').textContent).toContain('No se registró');expect(screen.getByRole('button',{name:'Ingresar al trabajo'}).disabled).toBe(false)
})
it('retains a request ID after uncertain responses and obtains a new fix for retry',async()=>{
 geo.mockImplementation(()=>Promise.resolve({latitude:34,longitude:-118,accuracy:20,capturedAt:new Date().toISOString()}));execute.mockRejectedValueOnce(new Error('NETWORK')).mockResolvedValueOnce({id:'shift'});show();fireEvent.click(screen.getByRole('button',{name:'Clock in',exact:true}));await waitFor(()=>expect(execute).toHaveBeenCalledTimes(1));await waitFor(()=>expect(screen.getByRole('button',{name:'Clock in',exact:true}).disabled).toBe(false));fireEvent.click(screen.getByRole('button',{name:'Clock in',exact:true}));await waitFor(()=>expect(execute).toHaveBeenCalledTimes(2));expect(execute.mock.calls[0][1].id).toBe(execute.mock.calls[1][1].id);expect(geo).toHaveBeenCalledTimes(2)
})
