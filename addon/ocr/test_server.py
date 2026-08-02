import unittest

from server import (
    MAX_PREPARED_PIXELS,
    Word,
    candidate_row_counts,
    candidate_score,
    group_words,
    prepared_dimensions,
)


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


class CandidateSelectionTests(unittest.TestCase):
    def test_complete_rows_beat_many_disconnected_price_fragments(self) -> None:
        coherent = [
            {"text": "CAT FOOD 0.38", "confidence": 0.82},
            {"text": "ORANGE JUICE 2.34", "confidence": 0.79},
            {"text": "INSTANT NOODLE 0.21", "confidence": 0.74},
        ]
        fragmented = [
            {"text": "CAT FOOD", "confidence": 0.91},
            {"text": "ORANGE JUICE", "confidence": 0.91},
            {"text": "INSTANT NOODLE", "confidence": 0.91},
            *[{"text": f"{number}.25", "confidence": 0.95} for number in range(10)],
        ]

        self.assertGreater(candidate_score(coherent), candidate_score(fragmented))
        self.assertEqual(candidate_row_counts(coherent), (3, 0))
        self.assertEqual(candidate_row_counts(fragmented), (0, 10))

    def test_totals_do_not_count_as_complete_product_rows(self) -> None:
        lines = [
            {"text": "WHEAT BISCUITS 0.69", "confidence": 0.8},
            {"text": "SUB-TOTAL 35.42", "confidence": 0.9},
            {"text": "TOTAL SAVINGS 3.11", "confidence": 0.9},
        ]

        self.assertEqual(candidate_row_counts(lines), (1, 0))


class ImageSizingTests(unittest.TestCase):
    def test_normal_receipt_is_upscaled_to_the_target_width(self) -> None:
        self.assertEqual(prepared_dimensions(900, 1400), (1800, 2800))

    def test_extreme_aspect_ratio_cannot_create_an_unbounded_working_image(self) -> None:
        width, height = prepared_dimensions(100, 4000)
        self.assertLessEqual(width * height, MAX_PREPARED_PIXELS)


if __name__ == "__main__":
    unittest.main()
