import {workersApi} from './workers.js'
export const teamRequest=(action='',body)=>workersApi('team/'+action,body)
