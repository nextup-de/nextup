// What the reducer made of the log in replay-log.ts at the base commit of NOR-A1, before any NOR rule: every field a case had before NOR.
// Copied from that run (decision D5, no old code is imported); the replay test compares the reducer with it field by field.
export const EXPECTED = {
  "demo": {
    "ca": {
      "id": "ca",
      "kind": "problem",
      "title": "Case ca",
      "body": "",
      "from": "J. Schmidt",
      "fromUserId": "u_ra",
      "assigneeSeatId": "s_own",
      "assigneeRoleId": "role_owner",
      "routeId": "r1",
      "assignee": "x",
      "raisedDay": 0,
      "status": "decided",
      "read": 1,
      "decided": {
        "answer": "no",
        "reason": "no time",
        "note": "The plan is full until Q4",
        "by": "T. Vogel",
        "day": 2,
        "projectId": null,
        "lead": null,
        "byUserId": "u_own"
      },
      "withdrawn": null,
      "question": null,
      "handed": [],
      "discussion": null,
      "versions": 1,
      "pausedDays": 0,
      "pausedSince": null,
      "history": [
        "r0",
        "r8",
        "r9"
      ],
      "route": "r1",
      "age": 12,
      "clock": 2,
      "open": false,
      "archived": true,
      "overdue": false,
      "dueDay": 5,
      "escalated": null,
      "override": null
    },
    "cb": {
      "id": "cb",
      "kind": "problem",
      "title": "Case cb",
      "body": "",
      "from": "M. Roth",
      "fromUserId": "u_rb",
      "assigneeSeatId": "s_own",
      "assigneeRoleId": "role_owner",
      "routeId": "r1",
      "assignee": "x",
      "raisedDay": 0,
      "status": "decided",
      "read": 1,
      "decided": {
        "answer": "no",
        "reason": "Too costly",
        "note": "",
        "by": "T. Vogel",
        "day": 1,
        "projectId": null,
        "lead": null,
        "byUserId": "u_own"
      },
      "withdrawn": null,
      "question": null,
      "handed": [],
      "discussion": null,
      "versions": 1,
      "pausedDays": 0,
      "pausedSince": null,
      "history": [
        "r1",
        "r10"
      ],
      "route": "r1",
      "age": 12,
      "clock": 1,
      "open": false,
      "archived": true,
      "overdue": false,
      "dueDay": 5,
      "escalated": null,
      "override": null
    },
    "cc": {
      "id": "cc",
      "kind": "problem",
      "title": "Case cc",
      "body": "",
      "from": "J. Schmidt",
      "fromUserId": "u_ra",
      "assigneeSeatId": "s_o2",
      "assigneeRoleId": "role_o2",
      "routeId": "r1",
      "assignee": "E. Wagner",
      "raisedDay": 0,
      "status": "open",
      "read": 1,
      "decided": null,
      "withdrawn": null,
      "question": {
        "text": "Which line?",
        "by": "T. Vogel",
        "byUserId": "u_own",
        "day": 1,
        "answer": {
          "text": "Line 3",
          "by": "J. Schmidt",
          "byUserId": "u_ra",
          "day": 3
        },
        "unanswered": null
      },
      "handed": [
        {
          "from": "T. Vogel",
          "fromUserId": "u_own",
          "to": "H. Sander",
          "toSeatId": "s_dep",
          "why": "Quality owns it",
          "day": 3
        },
        {
          "from": "H. Sander",
          "fromUserId": "u_dep",
          "to": "E. Wagner",
          "toSeatId": "s_o2",
          "why": "Engineering owns it",
          "day": 4
        }
      ],
      "discussion": null,
      "versions": 1,
      "pausedDays": 2,
      "pausedSince": null,
      "history": [
        "r2",
        "r11",
        "r13",
        "r14",
        "r15"
      ],
      "route": "r1",
      "age": 12,
      "clock": 10,
      "open": true,
      "archived": false,
      "overdue": true,
      "dueDay": 7,
      "escalated": {
        "to": "T. Vogel",
        "from": "E. Wagner",
        "day": 8,
        "live": true,
        "toSeatId": "s_own",
        "toRoleId": "role_owner"
      },
      "override": null
    },
    "cd": {
      "id": "cd",
      "kind": "problem",
      "title": "Case cd v2",
      "body": "A better body",
      "from": "M. Roth",
      "fromUserId": "u_rb",
      "assigneeSeatId": "s_own",
      "assigneeRoleId": "role_owner",
      "routeId": "r1",
      "assignee": "x",
      "raisedDay": 0,
      "status": "decided",
      "read": 1,
      "decided": {
        "answer": "yes",
        "reason": "",
        "note": "",
        "by": "T. Vogel",
        "day": 6,
        "projectId": "p_cd",
        "lead": "T. Vogel",
        "byUserId": "u_own"
      },
      "withdrawn": null,
      "question": null,
      "handed": [],
      "discussion": {
        "startedDay": 1,
        "by": "T. Vogel",
        "byUserId": "u_own",
        "invited": [
          "H. Sander",
          "K. Head"
        ],
        "invitedUserIds": [
          "u_dep",
          "u_head"
        ],
        "missing": "The saving",
        "rounds": [
          {
            "round": 1,
            "day": 3,
            "by": "T. Vogel",
            "byUserId": "u_own",
            "next": "round",
            "open": [
              "Cost"
            ],
            "note": "Round one"
          },
          {
            "round": 2,
            "day": 5,
            "by": "T. Vogel",
            "byUserId": "u_own",
            "next": "decide",
            "open": [],
            "note": "Ready"
          }
        ],
        "round": 1,
        "ready": true,
        "lastDay": 0
      },
      "versions": 2,
      "pausedDays": 0,
      "pausedSince": null,
      "history": [
        "r3",
        "r16",
        "r17",
        "r18",
        "r19",
        "r20",
        "r21"
      ],
      "route": "r1",
      "age": 12,
      "clock": 6,
      "open": false,
      "archived": true,
      "overdue": false,
      "dueDay": 5,
      "escalated": null,
      "override": null
    },
    "ce": {
      "id": "ce",
      "kind": "problem",
      "title": "Case ce",
      "body": "",
      "from": "J. Schmidt",
      "fromUserId": "u_ra",
      "assigneeSeatId": "s_dep",
      "assigneeRoleId": "role_deputy",
      "routeId": "r1",
      "assignee": "H. Sander",
      "raisedDay": 0,
      "status": "open",
      "read": 6,
      "decided": null,
      "withdrawn": null,
      "question": null,
      "handed": [
        {
          "from": "system:clock",
          "fromUserId": null,
          "to": "H. Sander",
          "toSeatId": "s_dep",
          "why": "deadline",
          "day": 6
        }
      ],
      "discussion": null,
      "versions": 1,
      "pausedDays": 0,
      "pausedSince": null,
      "history": [
        "r4",
        "r22",
        "r23",
        "r24",
        "r25"
      ],
      "route": "r1",
      "age": 12,
      "clock": 12,
      "open": true,
      "archived": false,
      "overdue": true,
      "dueDay": 5,
      "escalated": {
        "to": "T. Vogel",
        "from": "H. Sander",
        "day": 6,
        "live": true,
        "toSeatId": "s_own",
        "toRoleId": "role_owner"
      },
      "override": null
    },
    "cf": {
      "id": "cf",
      "kind": "problem",
      "title": "Case cf",
      "body": "",
      "from": "M. Roth",
      "fromUserId": "u_rb",
      "assigneeSeatId": "s_own",
      "assigneeRoleId": "role_owner",
      "routeId": "r1",
      "assignee": "T. Vogel",
      "raisedDay": 1,
      "status": "open",
      "read": null,
      "decided": null,
      "withdrawn": null,
      "question": null,
      "handed": [],
      "discussion": null,
      "versions": 1,
      "pausedDays": 0,
      "pausedSince": null,
      "history": [
        "r5",
        "r28"
      ],
      "route": "r1",
      "age": 11,
      "clock": 11,
      "open": true,
      "archived": false,
      "overdue": true,
      "dueDay": 6,
      "escalated": {
        "to": "H. Sander",
        "from": "T. Vogel",
        "day": 7,
        "live": true,
        "toSeatId": "s_dep",
        "toRoleId": "role_deputy"
      },
      "override": {
        "proposed": "r2",
        "chosen": "r1",
        "day": 5,
        "by": "K. Head",
        "byUserId": "u_head"
      }
    },
    "cg": {
      "id": "cg",
      "kind": "problem",
      "title": "Case cg",
      "body": "",
      "from": "J. Schmidt",
      "fromUserId": "u_ra",
      "assigneeSeatId": "s_own",
      "assigneeRoleId": "role_owner",
      "routeId": "r1",
      "assignee": "x",
      "raisedDay": 2,
      "status": "discussion",
      "read": 2,
      "decided": null,
      "withdrawn": null,
      "question": null,
      "handed": [],
      "discussion": {
        "startedDay": 2,
        "by": "T. Vogel",
        "byUserId": "u_own",
        "invited": [
          "K. Head"
        ],
        "invitedUserIds": [
          "u_head"
        ],
        "missing": "A number",
        "rounds": [],
        "round": 1,
        "ready": false,
        "lastDay": 11
      },
      "versions": 1,
      "pausedDays": 0,
      "pausedSince": null,
      "history": [
        "r6",
        "r26"
      ],
      "route": "r1",
      "age": 10,
      "clock": 10,
      "open": true,
      "archived": false,
      "overdue": true,
      "dueDay": 5,
      "escalated": {
        "to": "H. Sander",
        "from": "x",
        "day": 6,
        "live": true,
        "toSeatId": "s_dep",
        "toRoleId": "role_deputy"
      },
      "override": null
    },
    "ch": {
      "id": "ch",
      "kind": "problem",
      "title": "Case ch",
      "body": "",
      "from": "M. Roth",
      "fromUserId": "u_rb",
      "assigneeSeatId": "s_o2",
      "assigneeRoleId": "role_o2",
      "routeId": "r2",
      "assignee": "x",
      "raisedDay": 2,
      "status": "withdrawn",
      "read": null,
      "decided": null,
      "withdrawn": {
        "day": 4,
        "by": "M. Roth",
        "byUserId": "u_rb",
        "note": "Changed my mind"
      },
      "question": null,
      "handed": [],
      "discussion": null,
      "versions": 1,
      "pausedDays": 0,
      "pausedSince": null,
      "history": [
        "r7",
        "r27"
      ],
      "route": "r2",
      "age": 10,
      "clock": 2,
      "open": false,
      "archived": true,
      "overdue": false,
      "dueDay": 7,
      "escalated": null,
      "override": null
    }
  },
  "demoLedger": {
    "handedOver": 3,
    "escalated": 4,
    "overrides": 1,
    "projectsEscalated": 1,
    "measuresOwed": 0,
    "unmeasured": 0
  },
  "demoProjects": [
    {
      "id": "p_cd",
      "title": "Case cd",
      "lead": "T. Vogel",
      "status": "planning",
      "sources": [
        "cd"
      ]
    }
  ],
  "workdays": {
    "ca": {
      "id": "ca",
      "kind": "problem",
      "title": "Case ca",
      "body": "",
      "from": "J. Schmidt",
      "fromUserId": "u_ra",
      "assigneeSeatId": "s_own",
      "assigneeRoleId": "role_owner",
      "routeId": "r1",
      "assignee": "x",
      "raisedDay": 0,
      "status": "decided",
      "read": 1,
      "decided": {
        "answer": "no",
        "reason": "no time",
        "note": "The plan is full until Q4",
        "by": "T. Vogel",
        "day": 2,
        "projectId": null,
        "lead": null,
        "byUserId": "u_own"
      },
      "withdrawn": null,
      "question": null,
      "handed": [],
      "discussion": null,
      "versions": 1,
      "pausedDays": 0,
      "pausedSince": null,
      "history": [
        "r0",
        "r8",
        "r9"
      ],
      "route": "r1",
      "age": 12,
      "clock": 2,
      "open": false,
      "archived": true,
      "overdue": false,
      "dueDay": 5,
      "escalated": null,
      "override": null
    },
    "cb": {
      "id": "cb",
      "kind": "problem",
      "title": "Case cb",
      "body": "",
      "from": "M. Roth",
      "fromUserId": "u_rb",
      "assigneeSeatId": "s_own",
      "assigneeRoleId": "role_owner",
      "routeId": "r1",
      "assignee": "x",
      "raisedDay": 0,
      "status": "decided",
      "read": 1,
      "decided": {
        "answer": "no",
        "reason": "Too costly",
        "note": "",
        "by": "T. Vogel",
        "day": 1,
        "projectId": null,
        "lead": null,
        "byUserId": "u_own"
      },
      "withdrawn": null,
      "question": null,
      "handed": [],
      "discussion": null,
      "versions": 1,
      "pausedDays": 0,
      "pausedSince": null,
      "history": [
        "r1",
        "r10"
      ],
      "route": "r1",
      "age": 12,
      "clock": 1,
      "open": false,
      "archived": true,
      "overdue": false,
      "dueDay": 5,
      "escalated": null,
      "override": null
    },
    "cc": {
      "id": "cc",
      "kind": "problem",
      "title": "Case cc",
      "body": "",
      "from": "J. Schmidt",
      "fromUserId": "u_ra",
      "assigneeSeatId": "s_o2",
      "assigneeRoleId": "role_o2",
      "routeId": "r1",
      "assignee": "E. Wagner",
      "raisedDay": 0,
      "status": "open",
      "read": 1,
      "decided": null,
      "withdrawn": null,
      "question": {
        "text": "Which line?",
        "by": "T. Vogel",
        "byUserId": "u_own",
        "day": 1,
        "answer": {
          "text": "Line 3",
          "by": "J. Schmidt",
          "byUserId": "u_ra",
          "day": 3
        },
        "unanswered": null
      },
      "handed": [
        {
          "from": "T. Vogel",
          "fromUserId": "u_own",
          "to": "H. Sander",
          "toSeatId": "s_dep",
          "why": "Quality owns it",
          "day": 3
        },
        {
          "from": "H. Sander",
          "fromUserId": "u_dep",
          "to": "E. Wagner",
          "toSeatId": "s_o2",
          "why": "Engineering owns it",
          "day": 4
        }
      ],
      "discussion": null,
      "versions": 1,
      "pausedDays": 2,
      "pausedSince": null,
      "history": [
        "r2",
        "r11",
        "r13",
        "r14",
        "r15"
      ],
      "route": "r1",
      "age": 12,
      "clock": 10,
      "open": true,
      "archived": false,
      "overdue": true,
      "dueDay": 7,
      "escalated": null,
      "override": null
    },
    "cd": {
      "id": "cd",
      "kind": "problem",
      "title": "Case cd v2",
      "body": "A better body",
      "from": "M. Roth",
      "fromUserId": "u_rb",
      "assigneeSeatId": "s_own",
      "assigneeRoleId": "role_owner",
      "routeId": "r1",
      "assignee": "x",
      "raisedDay": 0,
      "status": "decided",
      "read": 1,
      "decided": {
        "answer": "yes",
        "reason": "",
        "note": "",
        "by": "T. Vogel",
        "day": 6,
        "projectId": "p_cd",
        "lead": "T. Vogel",
        "byUserId": "u_own"
      },
      "withdrawn": null,
      "question": null,
      "handed": [],
      "discussion": {
        "startedDay": 1,
        "by": "T. Vogel",
        "byUserId": "u_own",
        "invited": [
          "H. Sander",
          "K. Head"
        ],
        "invitedUserIds": [
          "u_dep",
          "u_head"
        ],
        "missing": "The saving",
        "rounds": [
          {
            "round": 1,
            "day": 3,
            "by": "T. Vogel",
            "byUserId": "u_own",
            "next": "round",
            "open": [
              "Cost"
            ],
            "note": "Round one"
          },
          {
            "round": 2,
            "day": 5,
            "by": "T. Vogel",
            "byUserId": "u_own",
            "next": "decide",
            "open": [],
            "note": "Ready"
          }
        ],
        "round": 1,
        "ready": true,
        "lastDay": 0
      },
      "versions": 2,
      "pausedDays": 0,
      "pausedSince": null,
      "history": [
        "r3",
        "r16",
        "r17",
        "r18",
        "r19",
        "r20",
        "r21"
      ],
      "route": "r1",
      "age": 12,
      "clock": 6,
      "open": false,
      "archived": true,
      "overdue": false,
      "dueDay": 5,
      "escalated": null,
      "override": null
    },
    "ce": {
      "id": "ce",
      "kind": "problem",
      "title": "Case ce",
      "body": "",
      "from": "J. Schmidt",
      "fromUserId": "u_ra",
      "assigneeSeatId": "s_dep",
      "assigneeRoleId": "role_deputy",
      "routeId": "r1",
      "assignee": "H. Sander",
      "raisedDay": 0,
      "status": "open",
      "read": 6,
      "decided": null,
      "withdrawn": null,
      "question": null,
      "handed": [
        {
          "from": "system:clock",
          "fromUserId": null,
          "to": "H. Sander",
          "toSeatId": "s_dep",
          "why": "deadline",
          "day": 6
        }
      ],
      "discussion": null,
      "versions": 1,
      "pausedDays": 0,
      "pausedSince": null,
      "history": [
        "r4",
        "r22",
        "r23",
        "r24",
        "r25"
      ],
      "route": "r1",
      "age": 12,
      "clock": 12,
      "open": true,
      "archived": false,
      "overdue": true,
      "dueDay": 5,
      "escalated": {
        "to": "K. Head",
        "from": "H. Sander",
        "day": 9,
        "live": true,
        "toSeatId": "s_head",
        "toRoleId": "role_head"
      },
      "override": null
    },
    "cf": {
      "id": "cf",
      "kind": "problem",
      "title": "Case cf",
      "body": "",
      "from": "M. Roth",
      "fromUserId": "u_rb",
      "assigneeSeatId": "s_own",
      "assigneeRoleId": "role_owner",
      "routeId": "r1",
      "assignee": "T. Vogel",
      "raisedDay": 1,
      "status": "open",
      "read": null,
      "decided": null,
      "withdrawn": null,
      "question": null,
      "handed": [],
      "discussion": null,
      "versions": 1,
      "pausedDays": 0,
      "pausedSince": null,
      "history": [
        "r5",
        "r28"
      ],
      "route": "r1",
      "age": 11,
      "clock": 11,
      "open": true,
      "archived": false,
      "overdue": true,
      "dueDay": 6,
      "escalated": null,
      "override": {
        "proposed": "r2",
        "chosen": "r1",
        "day": 5,
        "by": "K. Head",
        "byUserId": "u_head"
      }
    },
    "cg": {
      "id": "cg",
      "kind": "problem",
      "title": "Case cg",
      "body": "",
      "from": "J. Schmidt",
      "fromUserId": "u_ra",
      "assigneeSeatId": "s_own",
      "assigneeRoleId": "role_owner",
      "routeId": "r1",
      "assignee": "x",
      "raisedDay": 2,
      "status": "discussion",
      "read": 2,
      "decided": null,
      "withdrawn": null,
      "question": null,
      "handed": [],
      "discussion": {
        "startedDay": 2,
        "by": "T. Vogel",
        "byUserId": "u_own",
        "invited": [
          "K. Head"
        ],
        "invitedUserIds": [
          "u_head"
        ],
        "missing": "A number",
        "rounds": [],
        "round": 1,
        "ready": false,
        "lastDay": 11
      },
      "versions": 1,
      "pausedDays": 0,
      "pausedSince": null,
      "history": [
        "r6",
        "r26"
      ],
      "route": "r1",
      "age": 10,
      "clock": 10,
      "open": true,
      "archived": false,
      "overdue": true,
      "dueDay": 5,
      "escalated": null,
      "override": null
    },
    "ch": {
      "id": "ch",
      "kind": "problem",
      "title": "Case ch",
      "body": "",
      "from": "M. Roth",
      "fromUserId": "u_rb",
      "assigneeSeatId": "s_o2",
      "assigneeRoleId": "role_o2",
      "routeId": "r2",
      "assignee": "x",
      "raisedDay": 2,
      "status": "withdrawn",
      "read": null,
      "decided": null,
      "withdrawn": {
        "day": 4,
        "by": "M. Roth",
        "byUserId": "u_rb",
        "note": "Changed my mind"
      },
      "question": null,
      "handed": [],
      "discussion": null,
      "versions": 1,
      "pausedDays": 0,
      "pausedSince": null,
      "history": [
        "r7",
        "r27"
      ],
      "route": "r2",
      "age": 10,
      "clock": 2,
      "open": false,
      "archived": true,
      "overdue": false,
      "dueDay": 7,
      "escalated": null,
      "override": null
    }
  },
  "workdaysLedger": {
    "handedOver": 3,
    "escalated": 1,
    "overrides": 1,
    "projectsEscalated": 0,
    "measuresOwed": 0,
    "unmeasured": 0
  },
  "workdaysProjects": [
    {
      "id": "p_cd",
      "title": "Case cd",
      "lead": "T. Vogel",
      "status": "planning",
      "sources": [
        "cd"
      ]
    }
  ]
} as const;
