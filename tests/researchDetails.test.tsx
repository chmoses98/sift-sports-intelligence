import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {ResearchDetails} from '../src/components/sift2/ResearchDetails';
afterEach(cleanup);
const toggle=(node:HTMLDetailsElement,open:boolean)=>act(()=>{node.open=open;node.dispatchEvent(new Event('toggle'));});
describe('deferred full research',()=>{
 it('does not mount hidden research until the native disclosure is opened',async()=>{
  const mount=vi.fn();function Body(){mount();return <p>Published research</p>;}
  const {container}=render(<ResearchDetails id="research" summary="Full research"><Body/></ResearchDetails>);
  expect(mount).not.toHaveBeenCalled();expect(screen.queryByText('Published research')).toBeNull();
  toggle(container.querySelector('details')!,true);await screen.findByText('Published research');expect(mount).toHaveBeenCalledTimes(1);
 });
 it('supports programmatic opening and retains research inputs after closing',async()=>{
  const {container}=render(<ResearchDetails id="research" summary="Full research"><input aria-label="Research note" defaultValue=""/></ResearchDetails>);
  const node=container.querySelector('details')!;toggle(node,true);const note=await screen.findByLabelText('Research note');fireEvent.change(note,{target:{value:'Keep this research'}});
  toggle(node,false);toggle(node,true);await waitFor(()=>expect(screen.getByLabelText('Research note')).toHaveValue('Keep this research'));
 });
 it('resets deferred state when the game identity changes',async()=>{
  const {container,rerender}=render(<ResearchDetails key="a" id="research" summary="Full research"><p>Game A</p></ResearchDetails>);toggle(container.querySelector('details')!,true);await screen.findByText('Game A');
  rerender(<ResearchDetails key="b" id="research" summary="Full research"><p>Game B</p></ResearchDetails>);expect(screen.queryByText('Game A')).toBeNull();expect(screen.queryByText('Game B')).toBeNull();expect(container.querySelector('details')).not.toHaveAttribute('open');
 });
});
