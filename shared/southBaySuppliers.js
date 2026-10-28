// User's service area, not a selected job ZIP, supplier connection or stock claim.
export const serviceArea={baseCity:'Lawndale',description:'Los Angeles coast south toward Palos Verdes',jobZip:null}
export const candidateStores=Object.freeze([
 {id:'sw-704362',supplierId:'sherwin-williams',vendor:'Sherwin-Williams',storeId:'704362',storeZip:'90260',label:'Lawndale',url:'https://www.sherwin-williams.com/store-locator/paint-store/lawndale/ca/704362'},
 {id:'lowes-2268',supplierId:'lowes',vendor:"Lowe's",storeId:'2268',storeZip:'90505',label:'W. Torrance',url:'https://www.lowes.com/store/ca-torrance/2268'},
 {id:'hd-0620',supplierId:'home-depot',vendor:'The Home Depot',storeId:'0620',storeZip:'90250',label:'Hawthorne',url:'https://www.homedepot.com/l/Hawthorne/CA/Hawthorne/90250/620'},
 {id:'hd-0618',supplierId:'home-depot',vendor:'The Home Depot',storeId:'0618',storeZip:'90505',label:'Torrance',url:'https://www.homedepot.com/l/Torrance/CA/Torrance/90505/618'},
].map(row=>Object.freeze({...row,selected:false,connection:'not-configured',price:null,stock:null})))
