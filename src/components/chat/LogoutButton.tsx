'use client';

import styles from './LogoutButton.module.css';

export default function LogoutButton() {
  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <button className={styles.button} onClick={handleLogout} aria-label="Cerrar sesión">
      🚪
    </button>
  );
}
