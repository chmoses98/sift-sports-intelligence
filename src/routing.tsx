/** Public router adapter. Legacy navigation is unchanged; opt-in research retains workspace scope. */
import {useCallback,type ComponentProps} from 'react';
import {Link as RouterLink,NavLink as RouterNavLink,useLocation,useNavigate as useRouterNavigate,type NavigateFunction,type NavigateOptions,type To} from 'react-router';
import {workspaceTarget} from './lib/workspaceRoutes';
export * from 'react-router';
export function Link(props:ComponentProps<typeof RouterLink>){const {pathname}=useLocation();return <RouterLink {...props} to={workspaceTarget(props.to,pathname)}/>;}
export function NavLink(props:ComponentProps<typeof RouterNavLink>){const {pathname}=useLocation();return <RouterNavLink {...props} to={workspaceTarget(props.to,pathname)}/>;}
export function useNavigate():NavigateFunction {
  const navigate=useRouterNavigate();const {pathname}=useLocation();
  return useCallback(((to:To|number,options?:NavigateOptions)=>typeof to==='number'?navigate(to):navigate(workspaceTarget(to,pathname),options)) as NavigateFunction,[navigate,pathname]);
}
