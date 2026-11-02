from os import getenv
import logging

class Config(object):
    API_ID1 = int(getenv("API_ID", 25257724))
    API_HASH1 = getenv("API_HASH","dc21cb797ac8156f0cbedca9a62a804a")
    API_ID2 = int(getenv("API_ID", 27672711))
    API_HASH2 = getenv("API_HASH", "4e7aaf6a6b0ddcb00e05e9234e2e84dd")
    SESSION1 = getenv("SESSION1","BQGBZvwAJ91FLkj0gLg3UpIprqSGNJJvQ3d76rneFBYHdoUxIPDKXlw39_IdBK4k4HTe32ytpsNIA6eE8wyvUzTZpWDsJij7nPwi-InC_0qsgNf75xkD5ZNvq9kdpKsjgI7bd7ZCivsE_3VsAuvlf-NwsCHS5HOl-RBRKcye1m_c8mGeFzYjBjaY6CO8YNIJKVUgEoSek8v6PwAiODD1D_r_SSb3w1tCM7EI5oOiOjOauUF7wuTs-PoCxO-iM4wES4PC9WKM3FcniU0SC7IkBI4vPJ5XJqdUc5gHXNEqmLkspV52GNWyG8HxSJ1BqfCQSF8x-CCM7WKuFnVnttP-9Q-q3fbagAAAAAGBAWfhAA")
    SESSION2 = getenv("SESSION2", "BQGmQIcAsUoXze22s2bGiY0WD38sZtIz3MIJHdXoKlYsiNN8L4mEMjYd100EP7aX7YIK8QpVq6YZWG7sjdzAT3xCkKlXcJQbQ30iwMyPN187AHBJz5T1J-OctPUBUxgDDCiRI1jK1hwUxZol_8yjzR5lkCPiCO_lEPoyqURkNa_mNbwoDrqEnsTql8ELnr4UZtQrzo0OGylKgy6241VvdsmTh3M53liUBd3exT-PNEuX1XribKC-Dc0wOtadF6h9M-yg-Vqm34W1SlTiPYyhImmkXxQoZjAD9QEjVmpoMJBbRZC8qpt6hTiGMMIAoJLdAhloqh7mxVO2UNx1NvIJE314Z4PX3AAAAAF8RgSvAA")
    #SESSION2 = getenv("SESSION2","BQGmQIcAaT8TIf9oZ_Mt7lLls_hrRR00gFpjFd6Lh453TBAPIwAPpvPT4VEz70DkMQAww3jVJmg9kcoQjO5u2itMLUx45XoKeABN72JinSUMMzTaZxltjDhGwTKBsIAKoB6FbD4R__4Fd3m93TGyXYoLOsBvamegdEG3MkIJZV-szOZwbFntevqWEwAeG-Dl09eYqKQkQNoWfEst_aS0QYfn2cn3cE7eNo3inBwxzI-vVlsu_N5U2MF8RDHRAawTe3q3J3l1cZgEUFcZcucT4oDpa3UEUUat1WiQieLsvMy480YXTcJMAQR5rn8H-79guniGhdlSXUz9Z9XQVMLadAnga2ws-AAAAAF8RgSvAA")
    token = "8585797392:AAFXh4zjuT6r4RfgfEb4z7yu4sDPiamGQA4"
    tokentera = "8608904224:AAH7znGwpkUD7wN5h36DEK-7KcNsiBi6q_0"
    # Session3 and Session4 removed (promoters retired)

    # AllForward Worker Bots Pool (12 Verified Active Bots)
    BOT_WORKERS = [
        "8421439819:AAFPd3y_tHoumTPLRuNUD_rHFEiwSEvGbvE",
        "8399533664:AAGz1VIxoT-LBD6eqj4ardVDMEQhpN3bL2M",
        "8351387869:AAE9Or0oSMeWpqp8QufLa3eSO2BA3ZLskCs",
        "8553020860:AAF137FJiLyV8NN9wE_L4-qcL8CQ6DG74v4",
        "8536358106:AAGn1FkhOhpOv6_badW5NtNlCGu2iRncVms",
        "8435784531:AAFAsAJFdML2L6x7QU1-w52ZhVhoDn7bX48",
        "8544299302:AAE8wbACzhnkBWepAloIDBYKr6ZqIga7TKU",
        "8839296156:AAHNQjFMMSg5LVc4Pcc5_nBCZ2CgZhueWlY",
        "8803558100:AAFxFrB408lB8pecs0n_bQPsmrsgyj8t7Kc",
        "8871876487:AAF-z1uAsiqKMEsSLnmmegTWI-aETkLTTyg",
        "8484567134:AAGbV2g7A9o503qXDNqpIE4S0270WOj0sOs",
        "8825125992:AAGKsjCRxAZs_ojBTUyzgfAJKLeyhER7IZM"
    ]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
LOGGER = logging.getLogger("copy-user-bot")
