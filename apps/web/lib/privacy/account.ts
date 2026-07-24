import { randomUUID } from "node:crypto";
import { prisma } from "@vtk/db";
import { deleteObject } from "@vtk/storage";

/**
 * A data-subject export deliberately excludes credentials, session tokens,
 * password hashes, ticket access tokens and payment-provider secrets.
 */
export async function exportUserData(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      email: true,
      rNumber: true,
      rNumberFromKul: true,
      firwStudent: true,
      firwStudentChangedAt: true,
      emailVerified: true,
      avatarKey: true,
      locale: true,
      active: true,
      onboardedAt: true,
      street: true,
      houseNumber: true,
      bus: true,
      postalCode: true,
      city: true,
      birthDate: true,
      personalEmail: true,
      emailPreference: true,
      mailCategories: true,
      studyYears: true,
      studyProgrammes: true,
      notAtFaculty: true,
      notStudying: true,
      studyConfirmedYear: true,
      createdAt: true,
      updatedAt: true,
      memberships: {
        select: {
          role: true,
          year: true,
          titleNl: true,
          titleEn: true,
          group: { select: { code: true, nameNl: true, nameEn: true } },
        },
      },
      roles: {
        select: {
          year: true,
          role: { select: { code: true, nameNl: true, nameEn: true } },
        },
      },
      participatingShifts: {
        select: {
          payedOut: true,
          rewardPaid: true,
          shift: {
            select: { name: true, startTime: true, endTime: true, location: true },
          },
        },
      },
      theokotOrders: {
        select: {
          status: true,
          totalCents: true,
          createdAt: true,
          session: { select: { date: true } },
          voucherRedemption: { select: { amount: true, createdAt: true } },
          lines: {
            select: {
              quantity: true,
              unitPriceCents: true,
              sessionItem: { select: { nameNl: true, nameEn: true } },
            },
          },
        },
      },
      uitleenReservations: {
        select: {
          status: true,
          pickupDate: true,
          returnDate: true,
          memberNote: true,
          totalPriceCents: true,
          totalDepositCents: true,
          paymentMode: true,
          createdAt: true,
          lines: {
            select: {
              itemName: true,
              quantity: true,
              unitPriceCents: true,
              unitDepositCents: true,
            },
          },
        },
      },
      uitleenTransport: {
        select: {
          status: true,
          startAt: true,
          endAt: true,
          purpose: true,
          pickupAddress: true,
          destination: true,
          memberNote: true,
          priceCents: true,
          createdAt: true,
        },
      },
      ticketOrders: {
        select: {
          reference: true,
          buyerName: true,
          buyerEmail: true,
          locale: true,
          status: true,
          currency: true,
          subtotalCents: true,
          discountCents: true,
          totalCents: true,
          refundedCents: true,
          termsAcceptedAt: true,
          termsVersion: true,
          paidAt: true,
          createdAt: true,
          event: { select: { titleNl: true, titleEn: true, startsAt: true } },
          items: {
            select: {
              ticketTypeName: true,
              attendeeName: true,
              attendeeEmail: true,
              totalCents: true,
              answers: {
                select: { questionLabel: true, value: true },
              },
            },
          },
          payments: {
            select: {
              provider: true,
              status: true,
              amountCents: true,
              currency: true,
              succeededAt: true,
              createdAt: true,
            },
          },
          refunds: {
            select: {
              status: true,
              amountCents: true,
              reason: true,
              createdAt: true,
            },
          },
        },
      },
      doorLogs: {
        select: {
          at: true,
          rNumber: true,
          cardName: true,
          method: true,
          result: true,
          reason: true,
          offline: true,
        },
        orderBy: { at: "desc" },
      },
      doorShortcutTokens: {
        select: {
          label: true,
          expiresAt: true,
          lastUsedAt: true,
          revokedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const ticketOrders = user.ticketOrders.map((order) => ({
    ...order,
    items: order.items.map((item) => {
      const belongsToSubject =
        item.attendeeEmail === user.email || item.attendeeName === user.name;
      return belongsToSubject
        ? item
        : {
            ...item,
            attendeeName: "Third party (redacted)",
            attendeeEmail: null,
            answers: [],
          };
    }),
  }));

  return {
    generatedAt: new Date().toISOString(),
    controller: "VTK — it@vtk.be",
    notice:
      "Credentials, secrets, session tokens and ticket access tokens are excluded. Structured third-party attendee details are redacted; contact it@vtk.be for a reviewed access response covering unstructured records.",
    user: { ...user, ticketOrders },
  };
}

/**
 * Remove authentication and current-membership data and replace the user with a
 * stable tombstone. Transaction/payment records remain referentially intact but
 * directly identifying fields are scrubbed.
 */
export async function eraseUserData(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, name: true, avatarKey: true },
  });
  const tombstone = randomUUID();
  const deletedEmail = `deleted+${tombstone}@vtk.invalid`;

  // Fail before changing the database if object storage is unavailable, so the
  // request can be retried and the object key is not lost in a tombstone.
  if (user.avatarKey) await deleteObject(user.avatarKey);

  await prisma.$transaction(async (tx) => {
    const orders = await tx.ticketOrder.findMany({
      where: { buyerUserId: userId },
      select: { id: true },
    });
    const orderIds = orders.map((order) => order.id);

    await tx.session.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.verification.deleteMany({ where: { identifier: user.email } });
    await tx.groupMembership.deleteMany({ where: { userId } });
    await tx.userRole.deleteMany({ where: { userId } });
    await tx.pocRepresentative.deleteMany({ where: { userId } });
    await tx.userDashboardTilePref.deleteMany({ where: { userId } });
    await tx.dashboardTile.deleteMany({ where: { userId } });
    await tx.shiftParticipant.deleteMany({ where: { userId } });
    await tx.ticketEventUserGrant.deleteMany({ where: { userId } });
    await tx.doorAccessGrant.deleteMany({ where: { userId } });
    // De User-rij blijft als anonieme tombstone bestaan, dus een FK-cascade zou
    // deze credentials niet opruimen. Verwijder ze expliciet vóór anonimisering.
    await tx.doorShortcutToken.deleteMany({ where: { userId } });

    await tx.doorAccessLog.updateMany({
      where: { userId },
      data: { userId: null, rNumber: null, cardName: null, reason: null },
    });
    await tx.ticketAuditLog.updateMany({
      where: { actorUserId: userId },
      data: { actorUserId: null, ipAddress: null, metadata: { purged: true } },
    });
    await tx.ticketScanLog.updateMany({
      where: { scannerUserId: userId },
      data: { scannerUserId: null },
    });

    if (orderIds.length > 0) {
      await tx.ticketOrder.updateMany({
        where: { id: { in: orderIds } },
        data: {
          buyerUserId: null,
          buyerName: "Deleted user",
          buyerEmail: deletedEmail,
          requestFingerprint: null,
        },
      });
      await tx.ticketOrderItem.updateMany({
        where: {
          orderId: { in: orderIds },
          OR: [{ attendeeEmail: user.email }, { attendeeName: user.name }],
        },
        data: { attendeeName: "Deleted attendee", attendeeEmail: null },
      });
      await tx.ticketOutboxMessage.updateMany({
        where: { orderId: { in: orderIds } },
        data: { recipient: null, payload: { purged: true }, lastError: null },
      });
    }

    await tx.theokotOrder.updateMany({
      where: { userId },
      data: { statusNote: null },
    });
    await tx.theokotBan.updateMany({
      where: { userId },
      data: { reason: "Anonymised account", note: null, active: false },
    });
    await tx.uitleenReservation.updateMany({
      where: { userId },
      data: { memberNote: null, adminNote: null },
    });
    await tx.uitleenTransportBooking.updateMany({
      where: { userId },
      data: {
        purpose: "Anonymised booking",
        pickupAddress: null,
        destination: null,
        memberNote: null,
        adminNote: null,
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        name: "Deleted user",
        firstName: null,
        lastName: null,
        email: deletedEmail,
        rNumber: null,
        rNumberFromKul: false,
        firwStudent: false,
        firwStudentChangedAt: null,
        emailVerified: false,
        // Markeert de rij als tombstone in plaats van als gedeactiveerd lid, zodat
        // gebruikerslijsten hem kunnen wegfilteren zonder ook echte inactieve
        // leden te verbergen.
        deletedAt: new Date(),
        avatarKey: null,
        image: null,
        locale: "NL",
        active: false,
        isSuperAdmin: false,
        onboardedAt: null,
        street: null,
        houseNumber: null,
        bus: null,
        postalCode: null,
        city: null,
        birthDate: null,
        personalEmail: null,
        emailPreference: "UNIVERSITY",
        mailCategories: { set: [] },
        studyYears: { set: [] },
        studyProgrammes: { set: [] },
        notAtFaculty: false,
        notStudying: false,
        studyConfirmedYear: null,
      },
    });
  });

}
