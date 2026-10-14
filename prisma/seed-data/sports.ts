import { PrismaClient } from '@prisma/client';

/**
 * Transactional demo data for the Sports module, so both its own dashboard
 * (src/sports/dashboard/sports-dashboard.service.ts — totals, house
 * standings, upcoming fixtures, scoped by institute_id + academic_year) and
 * the platform-wide sports tile on the main dashboard
 * (src/sports/dashboard/dashboard.service.ts) show real activity.
 *
 * "Today" for the institute is 2026-10-14 and the running academic year is
 * "2026-27" (the sports dashboard's default). Dates are anchored to that
 * fixed point rather than the real system clock, spanning roughly the last
 * 6 months (May 2026 - Oct 2026).
 *
 * Safe to re-run: guarded by an early-return once enough participants
 * already exist for this institute.
 */

const TODAY = new Date('2026-10-14T00:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const ACADEMIC_YEAR = '2026-27';

const MIN_PARTICIPANTS = 60;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

function shuffle<T>(arr: readonly T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan',
  'Krishna', 'Ishaan', 'Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Kiara', 'Myra',
  'Riya', 'Priya', 'Neha', 'Pooja', 'Rahul', 'Rohan', 'Karan', 'Varun',
];
const LAST_NAMES = [
  'Sharma', 'Verma', 'Gupta', 'Iyer', 'Nair', 'Reddy', 'Rao', 'Patel',
  'Mehta', 'Joshi', 'Kulkarni', 'Pillai', 'Chopra', 'Malhotra', 'Bose', 'Desai',
];

export async function seedSports(prisma: PrismaClient, instId: string): Promise<void> {
  const existing = await prisma.sportsParticipant.count({ where: { institute_id: instId } });
  if (existing >= MIN_PARTICIPANTS) {
    console.log(`  (sports) already has ${existing} participants — skipping`);
    return;
  }

  // ---- Staff (coaches / house masters / officials) -------------------------
  const staffDefs = [
    { name: 'Coach Arvind Menon', role: 'coach' },
    { name: 'Coach Priyanka Das', role: 'coach' },
    { name: 'Coach Suresh Nair', role: 'coach' },
    { name: 'Ms. Lakshmi Pillai', role: 'house_master' },
    { name: 'Mr. Deepak Rao', role: 'house_master' },
    { name: 'Mr. Vikram Shetty', role: 'official' },
  ];
  const staffIds: number[] = [];
  for (const [i, s] of staffDefs.entries()) {
    const staff = await prisma.sportsStaff.create({
      data: {
        institute_id: instId,
        name: s.name,
        role: s.role,
        email: `sports.staff.${i + 1}@inst-demo-sports.test`,
        phone: `9${randInt(100000000, 999999999)}`,
      },
    });
    staffIds.push(staff.staff_id);
  }

  // One admin-role sports user to attribute created tournaments / recorded
  // results / awarded points to.
  const adminUser = await prisma.sportsUser.create({
    data: { role: 'admin', staff_id: staffIds[0] },
  });

  // ---- Houses ---------------------------------------------------------------
  const houseDefs = [
    { name: 'Phoenix House', color: '#E53935' },
    { name: 'Dragon House', color: '#1E88E5' },
    { name: 'Griffin House', color: '#43A047' },
    { name: 'Falcon House', color: '#FBC02D' },
  ];
  const houseIds: number[] = [];
  for (const [i, h] of houseDefs.entries()) {
    const house = await prisma.sportsHouse.create({
      data: {
        institute_id: instId,
        name: h.name,
        color_code: h.color,
        house_master_id: staffIds[3 + (i % 2)],
        motto: 'Strive. Compete. Excel.',
      },
    });
    houseIds.push(house.house_id);
  }

  // ---- Sports & venues --------------------------------------------------
  const sportDefs = [
    { name: 'Football', category: 'team' },
    { name: 'Basketball', category: 'team' },
    { name: 'Kabaddi', category: 'team' },
    { name: 'Athletics', category: 'individual' },
    { name: 'Badminton', category: 'individual' },
    { name: 'Table Tennis', category: 'individual' },
  ];
  const sportIds: number[] = [];
  for (const s of sportDefs) {
    const sport = await prisma.sportsSport.create({
      data: { institute_id: instId, name: s.name, category: s.category as any, description: `${s.name} at inter-house and inter-school level.` },
    });
    sportIds.push(sport.sport_id);
  }

  const venueDefs = [
    { name: 'Main Football Ground', type: 'ground', capacity: 500 },
    { name: 'Indoor Sports Hall', type: 'hall', capacity: 300 },
    { name: 'Basketball Court A', type: 'court', capacity: 150 },
    { name: 'School Swimming Pool', type: 'pool', capacity: 100 },
  ];
  const venueIds: number[] = [];
  for (const v of venueDefs) {
    const venue = await prisma.sportsVenue.create({
      data: { institute_id: instId, name: v.name, type: v.type as any, capacity: v.capacity },
    });
    venueIds.push(venue.venue_id);
  }

  // ---- Participants + house memberships ------------------------------------
  const PARTICIPANT_COUNT = 80;
  const participantIds: number[] = [];
  for (let i = 1; i <= PARTICIPANT_COUNT; i++) {
    const participant = await prisma.sportsParticipant.create({
      data: {
        institute_id: instId,
        name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
        class_section: `${randInt(6, 12)}-${pick(['A', 'B', 'C'])}`,
        roll_number: `R${String(i).padStart(4, '0')}`,
        gender: pick(['male', 'female']),
      },
    });
    participantIds.push(participant.participant_id);

    await prisma.sportsHouseMembership.create({
      data: {
        institute_id: instId,
        participant_id: participant.participant_id,
        house_id: houseIds[i % houseIds.length],
        academic_year: ACADEMIC_YEAR,
        status: 'active',
      },
    });
  }

  // ---- House points (spread across the last 6 months) + standings --------
  const pointTotals = new Map<number, number>(houseIds.map((id) => [id, 0]));
  const POINT_EVENTS = 60;
  for (let i = 0; i < POINT_EVENTS; i++) {
    const houseId = pick(houseIds);
    const points = randInt(5, 40);
    const awardedDate = new Date(TODAY.getTime() - randInt(0, 180) * DAY_MS);
    await prisma.sportsHousePoint.create({
      data: {
        institute_id: instId,
        house_id: houseId,
        points,
        source_type: pick(['tournament_result', 'discipline', 'participation', 'other']) as any,
        reason: 'Inter-house activity points',
        awarded_date: awardedDate,
        awarded_by: adminUser.user_id,
      },
    });
    pointTotals.set(houseId, (pointTotals.get(houseId) ?? 0) + points);
  }

  const ranked = [...pointTotals.entries()].sort((a, b) => b[1] - a[1]);
  for (const [rank, [houseId, total]] of ranked.entries()) {
    await prisma.sportsHouseStanding.upsert({
      where: { house_id_academic_year: { house_id: houseId, academic_year: ACADEMIC_YEAR } },
      update: { total_points: total, rank: rank + 1 },
      create: {
        house_id: houseId,
        institute_id: instId,
        academic_year: ACADEMIC_YEAR,
        total_points: total,
        rank: rank + 1,
      },
    });
  }

  // ---- Tournaments, teams, fixtures ----------------------------------------
  const tournamentDefs = [
    { name: 'Inter-House Football Championship', sportIdx: 0, startOffset: -150, endOffset: -130, status: 'completed' as const },
    { name: 'Summer Basketball League', sportIdx: 1, startOffset: -120, endOffset: -100, status: 'completed' as const },
    { name: 'Annual Athletics Meet', sportIdx: 3, startOffset: -90, endOffset: -85, status: 'completed' as const },
    { name: 'Inter-House Kabaddi Cup', sportIdx: 2, startOffset: -60, endOffset: -45, status: 'completed' as const },
    { name: 'Autumn Badminton Open', sportIdx: 4, startOffset: -20, endOffset: 10, status: 'ongoing' as const },
    { name: 'Inter-House Table Tennis Cup', sportIdx: 5, startOffset: -10, endOffset: 20, status: 'ongoing' as const },
    { name: 'Winter Football Invitational', sportIdx: 0, startOffset: 20, endOffset: 40, status: 'upcoming' as const },
    { name: 'Inter-School Basketball Tournament', sportIdx: 1, startOffset: 35, endOffset: 55, status: 'upcoming' as const },
  ];

  let fixtureCount = { scheduled: 0, completed: 0 };

  for (const def of tournamentDefs) {
    const tournament = await prisma.sportsTournament.create({
      data: {
        institute_id: instId,
        name: def.name,
        sport_id: sportIds[def.sportIdx],
        level: pick(['inter_house', 'inter_school']) as any,
        format: pick(['knockout', 'league', 'round_robin']) as any,
        start_date: addDays(TODAY, def.startOffset),
        end_date: addDays(TODAY, def.endOffset),
        venue_id: pick(venueIds),
        status: def.status,
        created_by: adminUser.user_id,
      },
    });

    // 4 teams per tournament, tied to houses for inter-house flavour.
    const teamIds: number[] = [];
    for (let t = 0; t < 4; t++) {
      const team = await prisma.sportsTournamentTeam.create({
        data: {
          institute_id: instId,
          tournament_id: tournament.tournament_id,
          house_id: houseIds[t % houseIds.length],
          team_name: `${houseDefs[t % houseDefs.length].name} ${def.name.split(' ')[0]}`,
          coach_id: staffIds[t % 3],
        },
      });
      teamIds.push(team.tournament_team_id);

      const members = shuffle(participantIds).slice(0, randInt(6, 10));
      for (const participantId of members) {
        await prisma.sportsTournamentTeamMember.create({
          data: {
            institute_id: instId,
            tournament_team_id: team.tournament_team_id,
            participant_id: participantId,
            role: 'player',
          },
        });
      }
    }

    // Fixtures: for completed/ongoing tournaments, fixtures are in the past
    // (and recorded as completed); for upcoming tournaments, fixtures sit
    // in the future (feeding the dashboard's "upcoming fixtures" list).
    const fixtureDates =
      def.status === 'upcoming'
        ? [addDays(TODAY, def.startOffset + 2), addDays(TODAY, def.startOffset + 5), addDays(TODAY, def.startOffset + 8)]
        : def.status === 'ongoing'
          ? [addDays(TODAY, -5), addDays(TODAY, 3), addDays(TODAY, 7)]
          : [addDays(TODAY, def.startOffset + 2), addDays(TODAY, def.startOffset + 4), addDays(TODAY, def.startOffset + 6)];

    for (let f = 0; f < fixtureDates.length; f++) {
      const scheduledDate = fixtureDates[f];
      const isFuture = scheduledDate.getTime() > TODAY.getTime();
      const [teamA, teamB] = shuffle(teamIds).slice(0, 2);
      const fixture = await prisma.sportsFixture.create({
        data: {
          institute_id: instId,
          tournament_id: tournament.tournament_id,
          round: f === 0 ? 'Quarterfinal' : f === 1 ? 'Semifinal' : 'Final',
          team_a_id: teamA,
          team_b_id: teamB,
          venue_id: pick(venueIds),
          scheduled_date: scheduledDate,
          status: isFuture ? 'scheduled' : 'completed',
        },
      });

      if (isFuture) {
        fixtureCount.scheduled++;
      } else {
        fixtureCount.completed++;
        const scoreA = randInt(0, 5);
        const scoreB = randInt(0, 5);
        const winnerTeamId = scoreA === scoreB ? null : scoreA > scoreB ? teamA : teamB;
        await prisma.sportsFixtureResult.create({
          data: {
            institute_id: instId,
            fixture_id: fixture.fixture_id,
            team_a_score: String(scoreA),
            team_b_score: String(scoreB),
            winner_team_id: winnerTeamId,
            recorded_by: adminUser.user_id,
          },
        });

        for (const participantId of shuffle(participantIds).slice(0, 4)) {
          await prisma.sportsPlayerMatchStat.create({
            data: {
              institute_id: instId,
              fixture_id: fixture.fixture_id,
              participant_id: participantId,
              stat_type: pick(['goals', 'points', 'assists', 'saves']),
              stat_value: randInt(0, 10),
            },
          });
        }

        if (winnerTeamId && def.status === 'completed') {
          await prisma.sportsAward.create({
            data: {
              institute_id: instId,
              tournament_team_id: winnerTeamId,
              tournament_id: tournament.tournament_id,
              award_type: f === 2 ? 'Champion' : 'Match Winner',
              issued_date: scheduledDate,
            },
          });
        }
      }
    }

    if (def.status === 'completed') {
      const recordParticipant = pick(participantIds);
      await prisma.sportsRecord.create({
        data: {
          institute_id: instId,
          participant_id: recordParticipant,
          sport_id: sportIds[def.sportIdx],
          record_type: pick(['personal_best', 'tournament_win', 'milestone', 'school_record']) as any,
          description: `Best performance at ${def.name}`,
          value: `${randInt(10, 100)} pts`,
          achieved_date: addDays(TODAY, def.endOffset),
          verified_by: adminUser.user_id,
        },
      });
    }
  }

  console.log(
    `  (sports) seeded ${PARTICIPANT_COUNT} participants, ${houseDefs.length} houses, ${tournamentDefs.length} tournaments, ${fixtureCount.scheduled} scheduled + ${fixtureCount.completed} completed fixtures`,
  );
}
