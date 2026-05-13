
import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        System.out.println("Starting...");
        if (sc.hasNextLine()) {
            String s = sc.nextLine();
            System.out.println("Got: " + s);
        } else {
            System.out.println("No input found!");
        }
    }
}
