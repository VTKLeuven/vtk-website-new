/** De teksten van het koppelscherm; ook gebruikt door de voorvertoning in het beheer. */

export type DiscordLinkLabels = {
  intro: string;
  submit: string;
  submitting: string;
  saved: string;
  doneTitle: string;
  doneBody: string;
  fallbackError: string;
  errors: Record<string, string>;
};

export function discordLinkLabels(nl: boolean, username: string): DiscordLinkLabels {
  const name = username || "dit Discord-account";
  return nl
    ? {
        intro: `Je koppelt ${name} aan het VTK-account waarmee je nu aangemeld bent. Zo kan je peilingen van je RiVers op Discord beantwoorden. Je antwoorden blijven anoniem.`,
        submit: "Koppel mijn Discord-account",
        submitting: "Bezig met koppelen...",
        saved: "Je Discord-account is gekoppeld.",
        doneTitle: "Gelukt, je Discord-account is gekoppeld.",
        doneBody: "Ga terug naar Discord en klik opnieuw op de knop van de peiling.",
        fallbackError: "Niet gekoppeld: er ging iets mis. Probeer het opnieuw.",
        errors: {
          DISCORD_LINK_EXPIRED: "Niet gekoppeld: deze link is verlopen. Klik opnieuw op de knop in Discord.",
          DISCORD_TAKEN: "Niet gekoppeld: dit Discord-account hangt al aan een ander VTK-account.",
        },
      }
    : {
        intro: `You are linking ${name} to the VTK account you are signed in with. This lets you answer polls from your student reps on Discord. Your answers stay anonymous.`,
        submit: "Link my Discord account",
        submitting: "Linking...",
        saved: "Your Discord account is linked.",
        doneTitle: "Done, your Discord account is linked.",
        doneBody: "Go back to Discord and press the button of the poll again.",
        fallbackError: "Not linked: something went wrong. Please try again.",
        errors: {
          DISCORD_LINK_EXPIRED: "Not linked: this link has expired. Press the button in Discord again.",
          DISCORD_TAKEN: "Not linked: this Discord account is already linked to another VTK account.",
        },
      };
}
