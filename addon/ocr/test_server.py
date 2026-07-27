import unittest

from server import Word, group_words


def word(left: int, top: int, width: int, height: int, text: str) -> Word:
    return Word(left, top, width, height, text, 90)


class ReceiptRowGroupingTests(unittest.TestCase):
    def test_rejoins_a_product_and_its_right_aligned_price(self) -> None:
        lines = group_words(
            [
                word(40, 100, 110, 24, "ORANGE"),
                word(165, 100, 85, 24, "JUICE"),
                word(720, 104, 75, 16, "2.34"),
            ]
        )

        self.assertEqual([line["text"] for line in lines], ["ORANGE JUICE 2.34"])

    def test_tall_symbol_cannot_chain_adjacent_rows_together(self) -> None:
        lines = group_words(
            [
                word(40, 100, 105, 22, "TESCO"),
                word(160, 100, 125, 22, "CRISPS"),
                word(590, 104, 18, 36, "*"),
                word(720, 103, 75, 18, "0.79"),
                word(40, 128, 130, 22, "INSTANT"),
                word(185, 128, 125, 22, "NOODLE"),
                word(720, 131, 75, 18, "0.21"),
            ]
        )

        self.assertEqual(
            [line["text"] for line in lines],
            ["TESCO CRISPS * 0.79", "INSTANT NOODLE 0.21"],
        )

    def test_overlapping_columns_remain_separate_rows(self) -> None:
        lines = group_words(
            [
                word(40, 100, 120, 22, "EGGS"),
                word(720, 103, 75, 18, "0.84"),
                word(40, 108, 170, 22, "SQUARE"),
                word(225, 108, 80, 22, "MED"),
                word(720, 111, 75, 18, "0.83"),
            ]
        )

        self.assertEqual(
            [line["text"] for line in lines],
            ["EGGS 0.84", "SQUARE MED 0.83"],
        )


if __name__ == "__main__":
    unittest.main()
