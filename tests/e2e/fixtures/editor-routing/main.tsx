import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter, useLocation} from 'react-router-dom';
import {DefaultToolRedirect} from '@/app/DefaultToolRedirect';
import {resolveHomeToolPath} from '@/shared/lib/tooling/homeNavigation';
function Proof() {
 const [redirect,setRedirect]=useState(false);
 const [home,setHome]=useState('');
 const location=useLocation();
 return <><button onClick={()=>setRedirect(true)}>Default route</button>
 <button onClick={()=>setHome(resolveHomeToolPath({preferredToolId: localStorage.getItem('e1-saved-tool') ?? 'missing-tool',videoEditorTimelineId:'retained-timeline'}))}>Home fallback</button>
 <output data-testid="route">{location.pathname}</output><output data-testid="home">{home}</output>
 {redirect && <DefaultToolRedirect/>}</>;
}
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={['/tools']}><Proof/></MemoryRouter>);
