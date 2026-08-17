import type { ReactNode } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { CardDemo } from '../screens/Demo/CardDemo';
import { FriendsScreen } from '../screens/Friends/FriendsScreen';
import { GamesList } from '../screens/Games/GamesList';
import { Lobby } from '../screens/Home/Lobby';
import { PlayScreen } from '../screens/Play/PlayScreen';
import { ProfileScreen } from '../screens/Profile/ProfileScreen';
import { CreateRoomScreen } from '../screens/Room/CreateRoomScreen';
import { JoinRoomScreen } from '../screens/Room/JoinRoomScreen';
import { JoinViaLink } from '../screens/Room/JoinViaLink';
import { RoomHome } from '../screens/Room/RoomHome';
import { RoomScreen } from '../screens/Room/RoomScreen';
import { SettingsScreen } from '../screens/Settings/SettingsScreen';
import { SoloSetupScreen } from '../screens/Solo/SoloSetupScreen';

function withShell(node: ReactNode) {
  return <AppShell>{node}</AppShell>;
}

export const router = createBrowserRouter([
  { path: '/', element: withShell(<Lobby />) },
  { path: '/games', element: withShell(<GamesList />) },
  { path: '/friends', element: withShell(<FriendsScreen />) },
  { path: '/profile', element: withShell(<ProfileScreen />) },
  { path: '/settings', element: withShell(<SettingsScreen />) },
  { path: '/demo', element: withShell(<CardDemo />) },
  { path: '/solo', element: withShell(<SoloSetupScreen />) },
  { path: '/room', element: withShell(<RoomHome />) },
  { path: '/room/create', element: withShell(<CreateRoomScreen />) },
  { path: '/room/join', element: withShell(<JoinRoomScreen />) },
  { path: '/room/:code', element: withShell(<RoomScreen />) },
  { path: '/join/:code', element: withShell(<JoinViaLink />) },
  { path: '/play/:gameKey', element: withShell(<PlayScreen />) },
]);
