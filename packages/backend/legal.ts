export const SUPPORT_EMAIL = 'nishit.nagar1@gmail.com';
export const POLICY_VERSION = '2026-10-21.1';
export const APP_VERSION = '1.0.0';
export const ACCOUNT_DELETION_NOTICE =
  'Your account closes and sign-in sessions are revoked immediately. We retain the account and personal contributions for a 30-day recovery window. Email support to request recovery after ownership verification, or to request permanent erasure sooner. After 30 days, permanent cleanup starts. Other members’ contributions remain; shared administration transfers where possible. There is no self-service restore screen.';
export type LegalPage = 'privacy' | 'terms' | 'help' | 'delete-account';
export type LegalSection = {
  title: string;
  text: string;
  links?: { label: string; href: string }[];
};
const googleLinks = [
  { label: 'Google Privacy Policy', href: 'https://policies.google.com/privacy' },
  { label: 'Google Terms of Service', href: 'https://policies.google.com/terms' },
  { label: 'Google Maps Additional Terms', href: 'https://www.google.com/help/terms_maps/' },
];

export const legalPages: Record<LegalPage, { title: string; sections: LegalSection[] }> = {
  privacy: {
    title: 'Privacy policy',
    sections: [
      {
        title: 'Who we are',
        text: `nico notes is a private shared journal for visits, places, photos and ratings, operated by Nishit Nagar. This policy covers the Android app and notes.nishitnagar.com. Effective 21 October 2026. For privacy questions or to exercise your rights, email ${SUPPORT_EMAIL}.`,
      },
      {
        title: 'Account and journal information',
        text: 'Google sign-in provides your account identifier, name, email address and profile image. We do not receive your Google password. We store your chosen display name and profile photo, board membership and invitations, visits and planned visits, notes, ratings, dishes, captions, saved links and photos. We also store terms acceptance, board change history and notification read state. You choose what journal content to add. Sign-in is required to use private boards.',
      },
      {
        title: 'Location, camera and selected photos',
        text: 'With your permission, foreground location helps center the map and find nearby places. Google receives search text, location bias and map requests when you use these services. We do not save your current device position to your account or track background location. A map pin or place reference you choose to save is associated with your board. Camera access is requested when taking a picture; the system photo picker lets you choose individual images. Declining optional permissions does not prevent entering a place manually. You can change permissions in device settings.',
      },
      {
        title: 'How we use information',
        text: 'We use information to authenticate you, restrict private-board access, store and display the journal, synchronize changes, provide maps and search, handle support and deletion requests, prevent misuse and investigate safety reports. We do not sell personal information, run advertising or use journal content for advertising profiles. This app does not include a separate third-party advertising or behavioral analytics service.',
      },
      {
        title: 'Who can see shared content',
        text: 'Board members can see your shared profile and contributions. Members can edit shared visit details, and admins manage membership and may enter ratings for members. Joining requires admin approval. Authorized service moderators may access reported content to investigate abuse. Share only content you have permission to share. Removing access cannot recall copies already viewed, photographed or downloaded by another person.',
      },
      {
        title: 'Service providers and international processing',
        text: 'Convex hosts authentication, the database, profile photos and uploaded journal images. Google provides sign-in, Maps and Places. Cloudflare hosts and delivers the website and public policy pages. These providers may process network and device information in countries outside your own under their applicable terms and privacy policies. Requests necessarily expose network information such as IP addresses to the service receiving them. The app’s private journal images are stored in Convex, rather than on the website host.',
        links: [
          { label: 'Convex Privacy Policy', href: 'https://www.convex.dev/legal/privacy' },
          { label: 'Cloudflare Privacy Policy', href: 'https://www.cloudflare.com/privacypolicy/' },
          ...googleLinks,
        ],
      },
      {
        title: 'Google Maps and Places data',
        text: 'Google Maps and Places SDKs may collect device and SDK metadata, IP addresses, crash and diagnostic information, pseudonymous SDK identifiers and map interaction events. Places also processes searches and location parameters needed for relevant results. These provider practices apply even though nico notes does not run its own behavioral analytics SDK. Google’s Privacy Policy applies to its processing, and use of Maps is subject to Google’s Terms of Service and Maps Additional Terms. We retain Google place IDs to remember your selections. Google-provided names, addresses, coordinates and attributions are fetched live and held only temporarily in app memory; they are not saved as journal records. Your own manually entered places, notes and ratings remain your journal content.',
        links: googleLinks,
      },
      {
        title: 'Security and device storage',
        text: 'The app connects to Convex and Google over HTTPS. Private journal records and journal photo reads require authentication and board access checks; account credentials and signing secrets remain on the backend. Device authentication tokens use the operating system’s secure storage on Android. The website stores authentication state and preferences in browser storage. We restrict operator access to support and safety functions. No internet service can guarantee absolute security. Profile images are shared with board members through an asset URL; someone who receives that URL may be able to view the image until it is removed. Protect your Google account and devices, and contact us if you suspect unauthorized access.',
      },
      {
        title: 'Retention and account deletion',
        text: 'Journal data remains while your account and boards are active. Ordinary deletions hide records and retain them internally, including associated images, so an authorized operator can investigate a verified support recovery request. There is no Trash screen or self-service restore. Retained content is not available through normal app queries; recovery must respect current access and blocking rules and cannot always be guaranteed. Contact support for permanent erasure. Removing a board member does not delete their historical contributions. Account-deletion requests immediately close account access and revoke sign-in sessions. A disclosed 30-day recovery window allows a verified support request to cancel deletion; logging in alone does not cancel it. After that window, background cleanup permanently removes authentication records, profile images, uploaded photos, ratings, authored notes and personal references, including previously soft-deleted records. You may request permanent erasure sooner by email. Shared factual place/visit records and other members’ contributions may remain without your authorship; boards with no remaining members are deleted. Shared administration transfers to a remaining member. Support and safety records are retained only as needed to resolve requests, address abuse and meet legal obligations; any necessary exception to account deletion will be explained. Provider operational backups and security logs may persist according to provider retention schedules and are not ordinary app-accessible records.',
      },
      {
        title: 'Requests, choices and your rights',
        text: `You can edit your profile, remove content where you have permission, leave boards and delete your account in Your account. You can also request account and associated-data deletion without installing the app through our Delete account page or by emailing ${SUPPORT_EMAIL}. We may verify ownership without asking for your password. We aim to complete verified requests within 30 days and will explain any delay or lawful retention. Depending on your location, you may have rights to access, correct, erase or receive your information, restrict or object to processing, or complain to your local data protection authority. Contact us to make a request.`,
      },
      {
        title: 'Children and policy changes',
        text: `nico notes is not directed to children under 13, or below the minimum age for independent consent where they live. If a child has provided personal information without the required authorization, contact ${SUPPORT_EMAIL} so we can investigate and remove it where appropriate. We will publish updates on this page and request renewed terms acceptance for material changes where appropriate.`,
      },
    ],
  },
  terms: {
    title: 'Terms and community rules',
    sections: [
      {
        title: 'Agreement and eligibility',
        text: 'Effective 21 October 2026. nico notes is operated by Nishit Nagar. By accepting these terms, you agree to use the service lawfully and follow these community rules. You must be at least 13 and meet the minimum age and authorization requirements where you live. If you cannot agree, do not create or upload content. You can request account deletion without accepting updated terms.',
      },
      {
        title: 'Your account and shared boards',
        text: 'Protect your Google account and do not impersonate others, share authentication credentials or attempt to access another person’s boards. Invite only people you trust. Board members can edit shared details; admins manage membership and may record ratings for members. Access can change when you leave, are removed or block another member. Removing membership is separate from deleting an account.',
      },
      {
        title: 'Your content and permission to operate the service',
        text: 'You retain rights in your content. You grant us the limited permission needed to store, process and display it to provide the service, share it with your selected board members and investigate reports. Upload only content you own or have permission to share. Obtain consent before sharing someone else’s private information or images. You are responsible for the content you submit and for respecting copyright and privacy rights.',
      },
      {
        title: 'Prohibited content and behavior',
        text: 'Do not create, upload or distribute child sexual abuse or exploitation material, sexual content involving minors, nonconsensual intimate imagery, threats, harassment, hateful abuse, terrorism content, illegal material or content that infringes another person’s rights. Do not expose private information, bully others, distribute malicious links, send spam, commit fraud or interfere with the service. Child sexual abuse and exploitation are expressly prohibited.',
      },
      {
        title: 'Reports, moderation and appeals',
        text: `Report content or a person through Board settings → Safety, including when the person is an admin. You can block another member and leave shared boards. Reports go to service moderators. We may remove content, restrict access, suspend accounts or respond to valid legal requests. Moderation is based on the information available and may involve accessing reported content. For an appeal, copyright concern, urgent safety report or child-safety concern, contact ${SUPPORT_EMAIL}. Include enough detail to identify the issue, but never send passwords or authentication tokens.`,
      },
      {
        title: 'Maps and third-party services',
        text: 'Maps, Places and Google sign-in depend on Google services. By using Google Maps features you are also subject to Google’s Terms of Service and Google Maps Additional Terms. Google processes information under its Privacy Policy. Places information can change and may be incomplete; verify opening times, addresses and directions before relying on them. nico notes is a journal, not an emergency or navigation service. Do not remove or obscure Google or third-party attribution.',
        links: googleLinks,
      },
      {
        title: 'Availability, changes and ending use',
        text: 'An internet connection is required. We may maintain, change or discontinue features and cannot guarantee uninterrupted availability or recovery of every item. Keep independent copies of irreplaceable memories. Deletion confirmations explain internal retention and the account-deletion recovery window. You can stop using the service or request deletion at any time. We may restrict access for breaches of these rules, security reasons or legal requirements.',
      },
      {
        title: 'Responsibility and contact',
        text: `To the extent permitted by applicable law, the service is provided as available without additional guarantees. Nothing here excludes rights or liabilities that cannot lawfully be excluded, including mandatory consumer rights. Contact ${SUPPORT_EMAIL} to resolve a concern. The privacy policy explains our data practices. Changes to these terms will be published here and material changes may require renewed acceptance.`,
      },
    ],
  },
  help: {
    title: 'Help and support',
    sections: [
      {
        title: 'Getting started',
        text: 'Sign in with Google, create a board or request to join using an invitation or board code. An admin approves new members. Record visits, dishes, ratings and pictures, or save a planned visit in Wishlist.',
      },
      {
        title: 'Photos and connection problems',
        text: 'Profile and visit images are stored in Convex. Journal photo reads require authentication and board access. An internet connection is required. If an upload is interrupted, retry the unfinished picture; a saved visit and its photos are separate steps. Check your connection and board access. Camera and foreground location permissions are optional and can be changed in device settings.',
      },
      {
        title: 'Privacy and safety',
        text: 'Your account contains profile controls and account deletion. Board settings contains reporting and blocking. You can report admins as well as members. Reports are reviewed by service moderators. Do not use support to send private photos, passwords or authentication tokens.',
      },
      {
        title: 'Contact support',
        text: `Email ${SUPPORT_EMAIL} with the app version, device type and a description of the problem. The same address handles privacy requests, deletion, copyright concerns, child-safety concerns and moderation appeals. For account deletion, use Your account → Delete account or our public Delete account page.`,
      },
    ],
  },
  'delete-account': {
    title: 'Delete your nico notes account',
    sections: [
      {
        title: 'Delete from the app or website',
        text: 'Open Your account → Delete account, read the consequences, type DELETE and confirm. You do not need to accept updated terms to delete an account. Access closes and sign-in sessions are revoked immediately. The account enters a 30-day recovery window; after that window, permanent background cleanup starts. Email support during the window to request recovery after ownership verification, or request permanent erasure sooner. Logging in alone does not cancel deletion.',
      },
      {
        title: 'Request deletion without the app',
        text: `Email ${SUPPORT_EMAIL} from the Google email used for nico notes with the subject “Delete my nico notes account”. Ask us to delete your account and associated data. No app installation is required. We verify ownership, acknowledge the request and aim to complete verified requests within 30 days. We will tell you if additional time or limited legal retention is necessary. Never send a password or authentication token.`,
      },
      {
        title: 'What is deleted and what remains',
        text: 'We remove your account and sign-in sessions, profile image, uploaded journal photos, ratings, authored notes and personal references. Other members’ contributions and shared factual visit/place records can remain without your authorship. Shared administration passes to a remaining member; boards with no members are deleted. Permanent cleanup after the 30-day recovery window cannot be undone. There is no self-service restore screen. Recovery requests require ownership verification and must arrive before permanent cleanup starts. Removing the app, signing out or leaving a board does not itself delete your account.',
      },
      {
        title: 'Backups, legal exceptions and downloaded copies',
        text: 'Deletion removes active app records through background cleanup. Provider backups and security logs can persist for their retention periods. If specific information must be retained for a legitimate legal or safety reason, we will explain the category and reason where legally permitted. We cannot recall copies previously downloaded by another board member. Contact support if cleanup appears incomplete.',
      },
    ],
  },
};
