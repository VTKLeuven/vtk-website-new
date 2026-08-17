import argparse
import os
import sys
import time
from hardware import Screen, Scanner

# LCD
screen = Screen(1, 0x27) # bus, addr
screen.show("Hello World!")

scanner = Scanner()
print(scanner.name)
