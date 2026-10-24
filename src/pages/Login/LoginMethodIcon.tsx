type LoginIcon = 'password' | 'email' | 'code' | 'apple'

// The four sign-in choices share a filled 24px silhouette and cut-out details.
const paths: Record<LoginIcon, string> = {
  password: 'M8 8V6a4 4 0 0 1 8 0v2h1a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3h1Zm2 0h4V6a2 2 0 0 0-4 0v2Zm2 5a1.5 1.5 0 0 0-.75 2.8V18h1.5v-2.2A1.5 1.5 0 0 0 12 13Z',
  email: 'M5 4a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H5Zm-.5 3.7 6.3 4.6a2 2 0 0 0 2.4 0l6.3-4.6-1.2-1.6L12 10.7 5.7 6.1 4.5 7.7Z',
  code: 'M6 3a4 4 0 0 0-4 4v8a4 4 0 0 0 4 4h1v3l4.5-3H18a4 4 0 0 0 4-4V7a4 4 0 0 0-4-4H6Zm1 7a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm5 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm5 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z',
  apple: 'M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.29 0-1.5.64-2.31.46-3.21-.35-5.08-5.23-4.33-13.19 1.44-13.47 1.4.07 2.38.79 3.21.85 1.23-.25 2.41-.99 3.73-.9 1.58.13 2.77.75 3.56 1.87-3.26 1.95-2.49 6.24.5 7.44-.6 1.57-1.37 3.14-2.87 4.82l.01-.01ZM12.03 6.75c-.15-2.33 1.74-4.25 3.91-4.44.3 2.69-2.44 4.7-3.91 4.44Z'
}

export function LoginMethodIcon({ name }: { name: LoginIcon }) {
  return <svg aria-hidden="true" data-icon-style="filled" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d={paths[name]} fillRule="evenodd" clipRule="evenodd" /></svg>
}
