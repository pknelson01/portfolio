import random
import csv

def all_names():
  names = {}
  counter = 0
  while True:
    add_name = input("Add new player: \n")
    if add_name != '':
      counter+=1
      names[counter] = add_name
    else:
      break
  
  for x in names:
    print(f"{x}: {names[x]}")

  return names

def randomize_order(x):
  list_of_names = []
  for i in x:
    list_of_names.append(x[i])

  shuffled_names = random.sample(list_of_names, len(list_of_names))
  print(shuffled_names)

  new_order = {}
  counter = 0
  for x in shuffled_names:
    counter += 1
    new_order[counter] = x

  print(new_order)
  return new_order

def selection(file, order):
  teams = []
  with open(file, newline='') as f:
    reader = csv.DictReader(f, skipinitialspace=True)
    for row in reader:
      teams.append({'seed': row['team'].strip(), 'name': row['seed'].strip()})

  players = [order[k] for k in sorted(order.keys())]
  n = len(players)

  assignments = {player: [] for player in players}
  for i, team in enumerate(teams):
    cycle = i // n
    pos = i % n
    if cycle % 2 == 0:
      player_idx = pos
    else:
      player_idx = (n - 1) - pos
    assignments[players[player_idx]].append(team)

  with open('draft_results.txt', 'w') as out:
    for player in players:
      out.write(f"{player}\n")
      for team in assignments[player]:
        out.write(f"  Seed {team['seed']}: {team['name']}\n")
      out.write("\n")

  print("Draft results written to draft_results.txt")


family = all_names()
order = randomize_order(family)
selection('team_seeding.csv', order)