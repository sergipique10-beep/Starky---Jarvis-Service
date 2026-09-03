import { Suspense } from 'react';
import LoginForm from './LoginForm';
import GalaxyBackground from './GalaxyBackground';

export default function LoginPage() {
  return (
    <>
      <GalaxyBackground />
      <Suspense>
        <LoginForm />
      </Suspense>
    </>
  );
}
