import { Outlet } from 'react-router-dom';
import NavBar from './NavBar.jsx';

// The app shell: every routed page renders inside this layout, below the
// persistent top bar. Used as a pathless layout route in App.jsx, so the bar
// mounts ONCE and stays put across navigation - only the <Outlet /> swaps.
export default function AppLayout() {
  return (
    <>
      <NavBar />
      <Outlet />
    </>
  );
}
